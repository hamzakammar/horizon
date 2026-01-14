import { z } from "zod";
import { getPiazzaCookieHeader } from "../study/piazzaAuth.js";

// Piazza API base URL
const PIAZZA_API = "https://piazza.com/logic/api";

interface PiazzaToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  handler: (args: any) => Promise<string>;
}

async function fetchPiazza(method: string, params: Record<string, any>): Promise<any> {
  const cookieHeader = await getPiazzaCookieHeader();
  
  // Extract session_id from cookies to use as CSRF token
  const sessionIdMatch = cookieHeader.match(/session_id=([^;]+)/);
  const csrfToken = sessionIdMatch ? sessionIdMatch[1] : "";
  
  const response = await fetch(`${PIAZZA_API}?method=${encodeURIComponent(method)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Cookie": cookieHeader,
      "csrf-token": csrfToken,
    },
    body: JSON.stringify({ method, params }),
  });

  if (!response.ok) {
    throw new Error(`Piazza API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Piazza API error: ${json.error}`);
  }
  
  return json;
}

// Get user's enrolled classes
async function getUserClasses(): Promise<string> {
  try {
    const result = await fetchPiazza("user_profile.get_profile", {});
    
    // The profile result contains user info - extract networks/classes from it
    const profile = result.result || {};
    
    // Networks are typically in the profile or we need to parse from cookies
    // Return the raw profile for now to see what's available
    return JSON.stringify(profile, null, 2);
  } catch (error) {
    return `Error fetching Piazza classes: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Get posts from a class
async function getClassPosts(classId: string, limit: number = 20): Promise<string> {
  try {
    const result = await fetchPiazza("network.filter_feed", {
      nid: classId,
      limit: limit,
      offset: 0,
    });

    const posts = result.result || [];
    return JSON.stringify(
      posts.map((p: any) => ({
        id: p.id,
        nr: p.nr,
        subject: p.subject,
        type: p.type,
        tags: p.tags,
        num_favorites: p.num_favorites,
        created: p.created,
      })),
      null,
      2
    );
  } catch (error) {
    return `Error fetching Piazza posts: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Get a specific post with its content
async function getPost(classId: string, postId: string): Promise<string> {
  try {
    const result = await fetchPiazza("content.get", {
      cid: postId,
      nid: classId,
    });

    const post = result.result;
    return JSON.stringify(
      {
        id: post.id,
        nr: post.nr,
        subject: post.subject,
        content: post.history?.[0]?.content || "",
        type: post.type,
        tags: post.tags,
        folders: post.folders,
        num_favorites: post.num_favorites,
        created: post.created,
        children: post.children?.map((c: any) => ({
          id: c.id,
          subject: c.subject,
          content: c.history?.[0]?.content || "",
          type: c.type,
        })),
      },
      null,
      2
    );
  } catch (error) {
    return `Error fetching Piazza post: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Search posts in a class
async function searchPosts(classId: string, query: string): Promise<string> {
  try {
    const result = await fetchPiazza("network.search", {
      nid: classId,
      query: query,
    });

    const posts = result.result || [];
    return JSON.stringify(
      posts.map((p: any) => ({
        id: p.id,
        nr: p.nr,
        subject: p.subject,
        type: p.type,
        tags: p.tags,
      })),
      null,
      2
    );
  } catch (error) {
    return `Error searching Piazza posts: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const piazzaTools: PiazzaToolDefinition[] = [
  {
    name: "piazza_get_classes",
    description: "Get all Piazza classes the user is enrolled in",
    inputSchema: z.object({}),
    handler: getUserClasses,
  },
  {
    name: "piazza_get_posts",
    description: "Get posts from a Piazza class",
    inputSchema: z.object({
      class_id: z.string().describe("Piazza class ID"),
      limit: z.number().optional().describe("Maximum number of posts to return (default: 20)"),
    }),
    handler: async (args) => getClassPosts(args.class_id, args.limit),
  },
  {
    name: "piazza_get_post",
    description: "Get a specific Piazza post with its content and replies",
    inputSchema: z.object({
      class_id: z.string().describe("Piazza class ID"),
      post_id: z.string().describe("Post ID (cid)"),
    }),
    handler: async (args) => getPost(args.class_id, args.post_id),
  },
  {
    name: "piazza_search",
    description: "Search for posts in a Piazza class",
    inputSchema: z.object({
      class_id: z.string().describe("Piazza class ID"),
      query: z.string().describe("Search query"),
    }),
    handler: async (args) => searchPosts(args.class_id, args.query),
  },
];
