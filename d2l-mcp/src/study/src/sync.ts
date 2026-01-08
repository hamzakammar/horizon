import { supabase } from "../../utils/supabase.js";
import { client } from '../../client.js';
import { marshalAssignments, RawAssignment } from '../../utils/marshal.js';

interface Enrollment {
  OrgUnit: {
    Id: number;
    Type: {
      Code: string;
      Name: string;
    };
    Name: string;
  };
  Access: {
    IsActive: boolean;
    CanAccess: boolean;
  };
}

export const SyncTools = {
  sync_all: {
    description: `Sync all assignments from all enrolled courses on Learn and add them as tasks in the database`,
    schema: {},
    handler: async () => {
      try {
        console.log('[SYNC] Starting sync_all...');
        
        // Get all enrollments
        const enrollmentsResponse = await client.getMyEnrollments() as { Items: Enrollment[] };
        console.log('[SYNC] Found enrollments:', enrollmentsResponse.Items.length);
        
        // Filter for active courses only
        const courses = enrollmentsResponse.Items.filter(
          (enrollment) =>
            enrollment.OrgUnit.Type.Code === "Course Offering" &&
            enrollment.Access.IsActive &&
            enrollment.Access.CanAccess
        );
        console.log('[SYNC] Active courses:', courses.length);

        let totalAssignments = 0;
        let totalAdded = 0;
        const results: Array<{ course: string; assignments: number; added: number }> = [];

        // For each course, get assignments and add to database
        for (const course of courses) {
          const orgUnitId = course.OrgUnit.Id;
          const courseName = course.OrgUnit.Name;
          console.log(`[SYNC] Processing course: ${courseName} (${orgUnitId})`);

          try {
            // Get assignments for this course
            const folders = await client.getDropboxFolders(orgUnitId) as RawAssignment[];
            const assignments = marshalAssignments(folders);
            console.log(`[SYNC] Found ${assignments.length} assignments in ${courseName}`);
            totalAssignments += assignments.length;

            // Add each assignment to database
            let addedCount = 0;
            for (const assignment of assignments) {
              console.log(`[SYNC] Processing assignment: ${assignment.name}, dueDate: ${assignment.dueDate}`);
              
              if (assignment.dueDate) {
                // Use assignment ID as source_ref (unique identifier from D2L)
                const sourceRef = `${orgUnitId}-${assignment.id}`;
                
                // Check if already exists by source_ref
                const { data: existing, error: selectError } = await supabase
                  .from('tasks')
                  .select('id')
                  .eq('source_ref', sourceRef)
                  .maybeSingle();

                console.log(`[SYNC] Existing check - found: ${!!existing}, error: ${selectError?.message}`);

                if (!existing && !selectError) {
                  console.log(`[SYNC] Inserting new task: ${assignment.name} (source_ref: ${sourceRef})`);
                  
                  // Insert new task
                  const { data, error } = await supabase
                    .from('tasks')
                    .insert({
                      title: assignment.name,
                      taskTitle: assignment.name,
                      status: 'pending',
                      source: `d2l-${orgUnitId}`,
                      source_ref: sourceRef,
                      due_at: assignment.dueDate,
                    })
                    .select();

                  if (error) {
                    console.error(`[SYNC] Insert error:`, error);
                  } else {
                    console.log(`[SYNC] Successfully inserted:`, data);
                    addedCount++;
                    totalAdded++;
                  }
                }
              } else {
                console.log(`[SYNC] Skipping assignment ${assignment.name} - no due date`);
              }
            }

            results.push({
              course: courseName,
              assignments: assignments.length,
              added: addedCount,
            });
          } catch (error) {
            console.error(`[SYNC] Error syncing course ${courseName}:`, error);
            results.push({
              course: courseName,
              assignments: 0,
              added: 0,
            });
          }
        }

        return JSON.stringify({
          success: true,
          totalCourses: courses.length,
          totalAssignments,
          totalAdded,
          results,
        }, null, 2);
      } catch (error) {
        console.error('[SYNC] Fatal error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }, null, 2);
      }
    },
  },
};