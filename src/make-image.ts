import { FilterStream } from 'blockmap';
import * as Bluebird from 'bluebird';
import * as commandLineArgs from 'command-line-args';
import { readFile } from 'fs';
import * as Path from 'path';
import * as ProgressBar from 'progress';
import { parse as urlParse } from 'url';
import { promisify } from 'util';

import { Destination, ProgressEvent, SparseWriteStream } from './destination/destination';
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

const getSource = (url: string): Promise<Bluebird.Disposer<Source>> => {
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

const calculateETA = (start: number, progress: ProgressEvent, size?: number, compressedSize?: number): number => {
	// TODO: handle case when only parts of source are read (progress has bytes)
	const duration = (Date.now() - start) / 1000;
	let left, speed;
	if ((compressedSize !== undefined) && (progress.compressedBytes !== undefined)) {
		left = compressedSize - progress.compressedBytes;
		speed = progress.compressedBytes / duration;
	} else if ((size !== undefined) && (progress.bytes !== undefined)) {
		left = size - progress.bytes;
		speed = progress.bytes / duration;
	} else {
		// TODO: throw ?
		return Infinity;
	}
	return left / speed;
};

const createProgressBar = (sourceStream: NodeJS.ReadableStream, destinationStream: NodeJS.WritableStream, size: number, compressedSize?: number): void => {
	const start = Date.now();
	const progressBar = new ProgressBar(
		'[:bar] :current / :total bytes ; :percent ; :timeLeft seconds left',
		{ total: size, width: 40 },
	);
	const updateProgressBar = (progress: ProgressEvent) => {
		const timeLeft = Math.round(calculateETA(start, progress, size, compressedSize));
		progressBar.tick(progress.position - progressBar.curr, { timeLeft });
	};
	sourceStream.on('progress', updateProgressBar);
};

const pipeSourceToDestination = async (source: Source, destination: Destination, config: any, trimPartitions: boolean): Promise<void> => {
	if (!(source instanceof RandomReadableSource)) {
		throw new Error('Not implemented yet');  // TODO
	}
	const configuredSource = await ConfiguredSource.fromSource(source, trimPartitions, legacyConfigure, config);
	const stream = await configuredSource.createSparseReadStream();
	const outputStream = await destination.createSparseWriteStream();
	const metadata = await source.getMetadata();

	createProgressBar(stream, outputStream, metadata.size, metadata.compressedSize);

	stream.pipe(outputStream);

	await new Promise((resolve: () => void, reject: (err: Error) => void) => {
		outputStream.on('finish', resolve);
		outputStream.on('error', reject);
		stream.on('error', reject);
	});
};

const main = async (input: string, output: string, configPath: string, trimPartitions: boolean): Promise<void> => {
	await Bluebird.using(
		getSource(input),
		FileDestination.createDisposer(output),
		getConfig(configPath),
		async (source: Source, destination: Destination, config: any): Promise<void> => {
			await pipeSourceToDestination(source, destination, config, trimPartitions);
		},
	);
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
		console.error('There was an error', error);
		process.exitCode = 1;
	}
};

wrapper();
