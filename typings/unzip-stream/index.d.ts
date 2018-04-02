declare module 'unzip-stream' {
	
	import { PassThrough, Transform } from 'stream';

	class ZipStreamEntry extends PassThrough {
		type: string;
		path: string;
		autodrain(): void;
	}

	function Parse(): Transform;

}
