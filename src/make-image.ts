import { S3 } from 'aws-sdk';
import * as commandLineArgs from 'command-line-args';
import { readFile } from 'fs';
import * as Path from 'path';
import * as ProgressBar from 'progress';
import { parse as urlParse } from 'url';
import { promisify } from 'util';

import { FileDestination } from './destination/file-destination';
import { ConfiguredSource } from './source/configured-source';
import { FileSource } from './source/file-source';
import { ResinS3Source } from './source/resin-s3-source';
import { Source } from './source/source';

const readFileAsync = promisify(readFile);

const s3Config: S3.Types.ClientConfiguration = {
	accessKeyId: '',
	secretAccessKey: '',
	s3ForcePathStyle: true,
	sslEnabled: false,
};
const s3 = new S3(s3Config);

// Make it work without accessKeyId and secretAccessKey
s3.getObject = (...args: any[]) => {
	return s3.makeUnauthenticatedRequest('getObject', ...args);
};
s3.headObject = (...args: any[]) => {
	return s3.makeUnauthenticatedRequest('headObject', ...args);
};

class UnsupportedSource extends Error {
	constructor(url: string) {
		super(`Unsupported source: ${url}`);
	}
}

const getSource = (url: string): Source => {
	const parsed = urlParse(url);
	let { protocol, path } = parsed;
	if (path === undefined) {
		throw new UnsupportedSource(url);
	}
	if (protocol === null) {
		// No protocol: assuming local file
		protocol = 'file:';
		path = Path.resolve(path);
	}
	if (protocol === 'file:') {
		// file:///absolute/path/to/resin.img
		return new FileSource(path);
	} else if (protocol === 'resin-s3:') {
		// resin-s3://resin-staging-img/raspberry-pi/2.9.6+rev1.prod
		if (parsed.host === undefined) {
			throw new UnsupportedSource(url);
		}
		const bucket = parsed.host;
		const [ deviceType, version ] = path.slice(1).split('/');
		return new ResinS3Source(s3, bucket, deviceType, version);
	}
	throw new UnsupportedSource(url);
};

const getConfig = async (path: string) => {
	if (path) {
		const data = await readFileAsync(path);
		return JSON.parse(data.toString());
	}
};

const main = async (input: string, output: string, configPath: string, trimPartitions: boolean): Promise<void> => {
	const source = getSource(input);
	const configuredSource = await ConfiguredSource.fromSource(source, await getConfig(configPath), trimPartitions);
	const metadata = await configuredSource.getMetadata();
	const stream = await configuredSource.createSparseReadStream();
	const destination = new FileDestination(output, metadata.size);
	const outputStream = await destination.createSparseWriteStream();

	const progressBar = new ProgressBar('[:bar] :current / :total bytes ; :percent', { total: stream.blockMap.imageSize, width: 40 });
	const updateProgressBar = () => {
		if (progressBar.curr !== stream.bytesRead) {
			progressBar.tick(stream.bytesRead - progressBar.curr);
		}
	};
	const progressBarUpdateInterval = setInterval(updateProgressBar, 1000 / 25);

	stream.pipe(outputStream);

	await new Promise((resolve: () => void, reject: (err: Error) => void) => {
		outputStream.on('close', resolve);
		outputStream.on('error', reject);
		stream.on('error', reject);
	});

	updateProgressBar();
	clearInterval(progressBarUpdateInterval);
};

const optionDefinitions = [
	{ name: 'input', alias: 'i', description: 'Input URL (file:// and resin-s3:// URLs are accepted', type: String },
	{ name: 'output', alias: 'o', description: 'Output file path', type: String },
	{ name: 'config', alias: 'c', description: 'Config file path (get a config from dashboard.resin.io)', type: String },
	{ name: 'trim-partitions', alias: 't', description: 'Trim all supported partitions (only ext is supported for now)', type: Boolean },
];
const { input, output, config, trimPartitions } = commandLineArgs(optionDefinitions, { camelCase: true } as commandLineArgs.Options);
// TODO: https://www.npmjs.com/package/command-line-args#usage-guide-generation
main(input, output, config, trimPartitions);
