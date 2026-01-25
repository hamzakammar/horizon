import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { notesService } from '../services/notes';

export default function UploadScreen() {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerResult | null>(null);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const navigation = useNavigation();

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setFile(result);
        if (!title) {
          setTitle(result.assets[0].name.replace('.pdf', ''));
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleUpload = async () => {
    if (!file || file.canceled || !file.assets || !file.assets[0]) {
      Alert.alert('Error', 'Please select a file');
      return;
    }

    const asset = file.assets[0];
    if (!asset.uri) {
      Alert.alert('Error', 'Invalid file');
      return;
    }

    setUploading(true);
    try {
      // Step 1: Get presigned URL
      const presignResponse = await notesService.presignUpload({
        filename: asset.name || 'document.pdf',
        contentType: asset.mimeType || 'application/pdf',
        size: asset.size || 0,
        courseId: courseId || undefined,
      });

      // Step 2: Upload file to S3
      await notesService.uploadFile(
        presignResponse.uploadUrl,
        asset.uri,
        asset.mimeType || 'application/pdf'
      );

      setUploading(false);
      setProcessing(true);

      // Step 3: Process the note
      const processResponse = await notesService.processNote({
        s3Key: presignResponse.s3Key,
        courseId: courseId || undefined,
        title: title || undefined,
      });

      Alert.alert(
        'Success',
        `Note processed successfully!\n${processResponse.chunkCount} chunks created from ${processResponse.pageCount} pages.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setFile(null);
              setTitle('');
              setCourseId('');
              setProcessing(false);
              // Navigate back
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'An error occurred');
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upload Note</Text>

      <View style={styles.section}>
        <Text style={styles.label}>File</Text>
        <TouchableOpacity style={styles.fileButton} onPress={pickDocument}>
          <Text style={styles.fileButtonText}>
            {file && !file.canceled && file.assets && file.assets[0]
              ? file.assets[0].name
              : 'Select PDF File'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Note title"
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Course ID (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., MATH119"
          value={courseId}
          onChangeText={setCourseId}
          autoCapitalize="characters"
        />
      </View>

      <TouchableOpacity
        style={[
          styles.uploadButton,
          (uploading || processing || !file || file.canceled) && styles.uploadButtonDisabled,
        ]}
        onPress={handleUpload}
        disabled={uploading || processing || !file || file.canceled}
      >
        {uploading || processing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadButtonText}>Upload & Process</Text>
        )}
      </TouchableOpacity>

      {(uploading || processing) && (
        <Text style={styles.statusText}>
          {uploading ? 'Uploading...' : 'Processing...'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  fileButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  fileButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#666',
    fontSize: 14,
  },
});
