/**
 * Push notification service for mobile app.
 * Uses Expo Push Notification service to send notifications.
 */

import { supabase } from "../utils/supabase.js";
import { D2LClient } from "../client.js";
import { SyncTools } from "../study/src/sync.js";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  sound?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: "default" | "normal" | "high";
  badge?: number;
}

/**
 * Register a device token for push notifications
 */
export async function registerDeviceToken(
  userId: string,
  deviceToken: string,
  platform: "ios" | "android"
): Promise<void> {
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      {
        user_id: userId,
        device_token: deviceToken,
        platform: platform,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,device_token",
      }
    );

  if (error) {
    throw new Error(`Failed to register device token: ${error.message}`);
  }
}

/**
 * Send a push notification to a device token
 */
async function sendPushNotification(message: ExpoPushMessage): Promise<void> {
  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push notification failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (result.data?.status === "error") {
      throw new Error(`Push notification error: ${result.data.message}`);
    }
  } catch (error) {
    console.error("[PUSH] Failed to send notification:", error);
    throw error;
  }
}

/**
 * Send push notification to all devices for a user
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<number> {
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("device_token, platform")
    .eq("user_id", userId);

  if (error || !tokens || tokens.length === 0) {
    console.error("[PUSH] No device tokens found for user:", userId);
    return 0;
  }

  let sentCount = 0;
  const messages: ExpoPushMessage[] = tokens.map((token: { device_token: string; platform: string }) => ({
    to: token.device_token,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
  }));

  // Send all notifications
  for (const message of messages) {
    try {
      await sendPushNotification(message);
      sentCount++;
    } catch (error) {
      console.error(`[PUSH] Failed to send to token ${message.to}:`, error);
    }
  }

  return sentCount;
}

/**
 * Check for D2L updates and send notifications
 * This should be called periodically (e.g., via cron)
 */
export async function checkAndNotifyUpdates(userId: string): Promise<{
  announcements: number;
  grades: number;
  assignments: number;
}> {
  const results = {
    announcements: 0,
    grades: 0,
    assignments: 0,
  };

  try {
    // Get user's D2L credentials
    const { data: credsData } = await supabase
      .from("user_credentials")
      .select("host")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1)
      .single();

    if (!credsData) {
      console.error("[PUSH] No D2L credentials found for user:", userId);
      return results;
    }

    const client = new D2LClient(userId, credsData.host);

    // Get enrollments to check each course
    const enrollments = await client.getMyEnrollments() as { Items: any[] };
    const courses = enrollments.Items.filter(
      (e: any) =>
        e.OrgUnit?.Type?.Code === "Course Offering" &&
        e.Access?.IsActive &&
        e.Access?.CanAccess
    );

    // Get last sync state
    const { data: syncState } = await supabase
      .from("sync_state")
      .select("last_sync_at, cursor")
      .eq("user_id", userId)
      .eq("source", "learn")
      .limit(1)
      .single();

    const lastSyncTime = syncState?.last_sync_at
      ? new Date(syncState.last_sync_at).getTime()
      : Date.now() - 24 * 60 * 60 * 1000; // Default to 24 hours ago

    // Check each course for updates
    for (const course of courses) {
      const orgUnitId = course.OrgUnit.Id;
      const courseName = course.OrgUnit.Name;

      try {
        // Check for new announcements
        const news = await client.getNews(orgUnitId) as any[];
        const newAnnouncements = news.filter((item: any) => {
          const itemDate = item.StartDate ? new Date(item.StartDate).getTime() : 0;
          return itemDate > lastSyncTime;
        });

        if (newAnnouncements.length > 0) {
          for (const announcement of newAnnouncements.slice(0, 3)) {
            // Limit to 3 most recent
            await sendPushToUser(
              userId,
              `New announcement in ${courseName}`,
              announcement.Title || "New announcement",
              {
                type: "announcement",
                courseId: String(orgUnitId),
                courseName,
                announcementId: announcement.Id,
              }
            );
            results.announcements++;
          }
        }

        // Check for grade updates (simplified - would need to compare with stored grades)
        // For now, we'll rely on the sync process to detect grade changes

        // Check for new assignments
        const { assignmentTools } = await import("../tools/dropbox.js");
        const folders = await client.getDropboxFolders(orgUnitId) as any[];
        const newAssignments = folders.filter((folder: any) => {
          const folderDate = folder.DueDate ? new Date(folder.DueDate).getTime() : 0;
          return folderDate > lastSyncTime;
        });

        if (newAssignments.length > 0) {
          for (const assignment of newAssignments.slice(0, 3)) {
            const dueDate = assignment.DueDate
              ? new Date(assignment.DueDate).toLocaleDateString()
              : "No due date";
            await sendPushToUser(
              userId,
              `New assignment: ${assignment.Name}`,
              `Due: ${dueDate}`,
              {
                type: "assignment",
                courseId: String(orgUnitId),
                courseName,
                assignmentId: assignment.Id,
              }
            );
            results.assignments++;
          }
        }
      } catch (error) {
        console.error(`[PUSH] Error checking course ${orgUnitId}:`, error);
      }
    }

    // Update sync state
    await supabase
      .from("sync_state")
      .upsert(
        {
          user_id: userId,
          source: "learn",
          course_id: null,
          last_sync_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,source,course_id",
        }
      );
  } catch (error) {
    console.error("[PUSH] Error checking updates:", error);
  }

  return results;
}
