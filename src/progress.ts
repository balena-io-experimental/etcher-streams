export interface ProgressEvent {
	bytes: number;  // amount of bytes actually read or written from/to the source/destination
	position: number;  // position in the stream (may be different from bytes if we skip some chunks)
	time: number;  // time actually spent reading or writing in milliseconds
	compressedBytes?: number;  // amount of bytes actually read from the compressed source
}
