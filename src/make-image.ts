import { S3 } from 'aws-sdk';
import * as Promise from 'bluebird';
import * as commandLineArgs from 'command-line-args';
import * as fs from 'mz/fs';
import * as Path from 'path';
import * as ProgressBar from 'progress';
import { parse as urlParse } from 'url';

import { ConfiguredSource } from './configured-source';
import { FileDestination } from './file-destination';
import { FileSource } from './file-source';
import { ResinS3Source } from './resin-s3-source';

const s3 = new S3({
	accessKeyId: null,
	secretAccessKey: null,
	s3ForcePathStyle: true,
	sslEnabled: false,
});

// Make it work without accessKeyId and secretAccessKey
for (const key of [ 'getObject', 'headObject' ]) {
	s3[key] = (...args) => {
		return s3.makeUnauthenticatedRequest(key, ...args);
	};
}

const getSource = (url) => {
	const parsed = urlParse(url);
	let { protocol, path } = parsed;
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
		const bucket = parsed.host;
		const [ deviceType, version ] = path.slice(1).split('/');
		return new ResinS3Source(s3, bucket, deviceType, version);
	}
	throw new Error(`Unsupported source: ${url}`);
};

const getConfig = async (path) => {
	if (path) {
		const data = await fs.readFile(path);
		return JSON.parse(data);
	}
};

const main = async (input, output, configPath, trimPartitions) => {
	const source = getSource(input);
	const configuredSource = await ConfiguredSource.fromSource(source, getConfig(configPath), trimPartitions);
	const metadata = await configuredSource.getMetadata();
	const stream = await configuredSource.createSparseReadStream({});
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

	await new Promise((resolve, reject) => {
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
const { input, output, config, trimPartitions } = commandLineArgs(optionDefinitions, { camelCase: true });
// TODO: https://www.npmjs.com/package/command-line-args#usage-guide-generation
main(input, output, config, trimPartitions);
