declare module 'unzip-stream' {
	
	import { PassThrough, Transform } from 'stream';

	class ZipStreamEntry extends PassThrough {
		type: string;
		path: string;
		size: number;
		autodrain(): void;
	}

	function Parse(): Transform;

}
