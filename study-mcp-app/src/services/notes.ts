import { apiClient } from '../config/api';
import {
  PresignUploadRequest,
  PresignUploadResponse,
  ProcessNoteRequest,
  ProcessNoteResponse,
  Note,
} from '../types';

export class NotesService {
  async presignUpload(data: PresignUploadRequest): Promise<PresignUploadResponse> {
    const response = await apiClient.post<PresignUploadResponse>(
      '/notes/presign-upload',
      data
    );
    return response.data;
  }

  async processNote(data: ProcessNoteRequest): Promise<ProcessNoteResponse> {
    const response = await apiClient.post<ProcessNoteResponse>(
      '/notes/process',
      data
    );
    return response.data;
  }

  async getNotes(courseId?: string): Promise<Note[]> {
    const params = courseId ? { courseId } : {};
    const response = await apiClient.get<{ notes: Note[] }>('/notes', { params });
    return response.data.notes || [];
  }

  async deleteNote(noteId: string): Promise<void> {
    await apiClient.delete<{ status: string; noteId: string }>(
      `/notes/${noteId}`
    );
  }

  async uploadFile(
    uploadUrl: string,
    fileUri: string,
    contentType: string
  ): Promise<void> {
    // Read file and upload to S3
    const response = await fetch(fileUri);
    const blob = await response.blob();

    await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': contentType,
      },
    });
  }

  /**
   * Embed missing note sections
   * Triggers embedding generation for notes that haven't been embedded yet
   */
  async embedMissing(): Promise<{ status: string; message: string }> {
    const response = await apiClient.post<{ status: string; message: string }>(
      '/notes/embed-missing'
    );
    return response.data;
  }

  /**
   * Search notes using semantic search
   */
  async searchNotes(query: string, courseId?: string): Promise<any[]> {
    const params: any = { q: query };
    if (courseId) {
      params.courseId = courseId;
    }
    const response = await apiClient.get<{ hits: any[] }>('/search', { params });
    return response.data.hits || [];
  }
}

export const notesService = new NotesService();
