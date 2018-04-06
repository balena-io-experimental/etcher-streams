import * as Bluebird from 'bluebird';
import * as commandLineArgs from 'command-line-args';
import { readFile } from 'fs';
import * as Path from 'path';
import * as ProgressBar from 'progress';
import { parse as urlParse } from 'url';
import { promisify } from 'util';

import { Destination } from './destination/destination';
import { FileDestination } from './destination/file-destination';
import { ConfiguredSource } from './source/configured-source';
import { configure as legacyConfigure } from './source/configured-source/configure';
import { FileSource } from './source/file-source';
import { ResinS3Source } from './source/resin-s3-source';
import { RandomReadableSource, Source } from './source/source';
import { ZipSource } from './source/zip-source';

const readFileAsync = promisify(readFile);

// Sources that only accept some specific extensions must come first.
const SOURCE_TYPES = [ ZipSource, FileSource, ResinS3Source ];

const getSource = (url: string): Bluebird.Disposer<Source> => {
	const parsed = urlParse(url);
	for (const sourceType of SOURCE_TYPES) {
		if (sourceType.canOpenURL(parsed)) {
			return sourceType.fromURL(parsed);
		}
	}
	throw new Error(`Unsupported source: ${url}`);
};

const getConfig = async (path: string) => {
	if (path) {
		const data = await readFileAsync(path);
		const config = JSON.parse(data.toString());
		return { config };
	}
};

//const wololo = async (source: Source, destination: Destination, config: any, trimPartitions: boolean) {
//	if ((config === undefined) && !trimPartitions) {
//		const rs = await source.createReadStream();
//		const ws = await destination.createWriteStream();
//		await new Promise((resolve: () => void, reject: (err: Error) => void) => {
//			rs.on('error', reject);
//			ws.on('error', reject);
//			ws.on('close', resolve);
//			rs.pipe(ws);
//		})
//		return
//	}
//	if (!(source instanceof RandomReadableSource)) {
//		const configuredSource = 
//}

const pipeSourceToDestination = async (source: Source, destination: Destination, config: any, trimPartitions: boolean): Promise<void> => {
	if (!(source instanceof RandomReadableSource)) {
		throw new Error('Not implemented yet');  // TODO
	}
	const configuredSource = await ConfiguredSource.fromSource(source, trimPartitions, legacyConfigure, config);
	const stream = await configuredSource.createSparseReadStream();
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
		outputStream.on('finish', resolve);
		outputStream.on('error', reject);
		stream.on('error', reject);
	});

	updateProgressBar();
	clearInterval(progressBarUpdateInterval);
}

const main = async (input: string, output: string, configPath: string, trimPartitions: boolean): Promise<void> => {
	const config = await getConfig(configPath);
	await Bluebird.using(getSource(input), async (source: Source) => {
		const metadata = await source.getMetadata();
		await Bluebird.using(FileDestination.createDisposer(output, metadata.size), async (destination: FileDestination) => {
			await pipeSourceToDestination(source, destination, config, trimPartitions);
		});
	});
};

const optionDefinitions = [
	{ name: 'input', alias: 'i', description: 'Input URL (file:// and resin-s3:// URLs are accepted', type: String },
	{ name: 'output', alias: 'o', description: 'Output file path', type: String },
	{ name: 'config', alias: 'c', description: 'Config file path (get a config from dashboard.resin.io)', type: String },
	{ name: 'trim-partitions', alias: 't', description: 'Trim all supported partitions (only ext is supported for now)', type: Boolean },
];
const { input, output, config, trimPartitions } = commandLineArgs(optionDefinitions, { camelCase: true } as commandLineArgs.Options);
// TODO: https://www.npmjs.com/package/command-line-args#usage-guide-generation

const wrapper = async (): Promise<void> => {
	try {
		await main(input, output, config, trimPartitions);
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}

wrapper();
