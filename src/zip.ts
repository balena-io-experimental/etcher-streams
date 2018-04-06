import * as unzip from 'unzip-stream';

export const getFileStreamFromZipStream = async (zipStream: NodeJS.ReadableStream, filePath?: string): Promise<unzip.ZipStreamEntry> => {
	return await new Promise((resolve: (entry: unzip.ZipStreamEntry) => void, reject: (err: Error) => void) => {
		let found = false;
		zipStream.on('error', reject);
		const unzipper = unzip.Parse();
		unzipper.on('error', reject);
		zipStream.pipe(unzipper);
		unzipper.on('entry', (entry: unzip.ZipStreamEntry) => {
			if (!found && (entry.type === 'File') && ((filePath === undefined) || (entry.path === filePath))) {
				found = true;
				entry.on('end', () => {
					// Stop reading the zip archive once the file we want has been extracted.
					zipStream.unpipe(unzipper);
				});
				resolve(entry);
			} else {
				entry.autodrain();
			}
		});
		zipStream.on('finish', () => {
			if (!found) {
				const msg = (filePath === undefined) ? "Can't find any file in this zip" : `Can't find a '${filePath}' file in this zip`;
				reject(new Error(msg));
			}
		});
	});
};
