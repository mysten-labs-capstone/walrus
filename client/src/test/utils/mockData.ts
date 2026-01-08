export const MOCK_PRIVATE_KEY = '0x' + 'a'.repeat(64);

export const MOCK_BLOB_ID = 'QEkuuMJoIBKXbNTFFN9sm7xcx6vtZkZfYOYDYOpJ0LY';

export const MOCK_FILE = {
  name: 'test.txt',
  size: 1024,
  type: 'text/plain',
  lastModified: Date.now(),
} as File;

export const MOCK_UPLOADED_FILE = {
  blobId: MOCK_BLOB_ID,
  name: 'test.txt',
  size: 1024,
  type: 'text/plain',
  uploadedAt: new Date().toISOString(),
};

export const MOCK_VERIFY_RESPONSE = {
  isValid: true,
  errors: [],
  warnings: [],
  fileInfo: {
    name: 'test.txt',
    size: 1024,
    type: 'text/plain',
  },
};

export const MOCK_UPLOAD_RESPONSE = {
  blobId: MOCK_BLOB_ID,
};