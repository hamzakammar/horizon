import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import * as DocumentPicker from 'expo-document-picker';

const UploadNote = () => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.type === 'cancel') return;

    setUploading(true);
    try {
      const { name, uri } = result;
      const response = await fetch(uri);
      const file = await response.blob();

      const { data, error } = await supabase.storage.from('notes').upload(name, file);
      if (error) {
        console.error('Error uploading file:', error);
      } else {
        if (__DEV__) console.log('File uploaded successfully:', data);
      }
    } catch (error) {
      console.error('Unexpected error during file upload:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <button onClick={handleUpload} disabled={uploading}>
      {uploading ? 'Uploading...' : 'Upload Note'}
    </button>
  );
};

export default UploadNote;