interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string,
  }): Promise<FileSystemFileHandle>;
}
