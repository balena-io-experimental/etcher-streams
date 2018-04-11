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
import { FileSource, makeSourceRandomReadable  } from './source/file-source';
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

const pipeSourceToDestination = async (source: Source, destination: Destination, config: any, trimPartitions: boolean): Promise<void> => {
	// Do we need to configure the destination ?
	const configureDestination = (
		(config !== undefined) &&
		!(source instanceof RandomReadableSource) &&
		!trimPartitions
	);
	// Do we need to configure the source ?
	const configureSource = (config !== undefined) && !configureDestination;
	// Do we need to make the source randomly readable ?
	const shouldMakeSourceRandomReadable = (
		!(source instanceof RandomReadableSource) && 
		(trimPartitions || configureSource)
	);
	if (shouldMakeSourceRandomReadable) {
		await Bluebird.using(makeSourceRandomReadable(source), async (source: RandomReadableSource) => {
			await pipeSourceToDestination(source, destination, config, trimPartitions);
		});
		return;
	}
	if (configureSource) {
		source = await ConfiguredSource.fromSource(source, trimPartitions, legacyConfigure, config);
	}
	let sourceStream;
	let destinationStream;
	if (trimPartitions) {
		sourceStream = await source.createSparseReadStream();
		destinationStream = await destination.createSparseWriteStream();
	} else {
		sourceStream = await source.createReadStream();
		destinationStream = await destination.createWriteStream();
	}
	const progressBar = new ProgressBar('[:bar] :current / :total bytes ; :percent', { total: sourceStream.blockMap.imageSize, width: 40 }); // TODO
	const updateProgressBar = () => {
		if (progressBar.curr !== sourceStream.bytesRead) {
			progressBar.tick(sourceStream.bytesRead - progressBar.curr);
		}
	};
	const progressBarUpdateInterval = setInterval(updateProgressBar, 1000 / 25);

	sourceStream.pipe(outputStream);

	await new Promise((resolve: () => void, reject: (err: Error) => void) => {
		outputStream.on('finish', resolve);
		outputStream.on('error', reject);
		stream.on('error', reject);
	});

	updateProgressBar();
	clearInterval(progressBarUpdateInterval);

	//if (!(source instanceof RandomReadableSource)) {
	//	if (trimPartitions) {
	//		// Make it randomly readable as we need to trim it
	//		Bluebird.using(makeSourceRandomReadable(source), async (source: RandomReadableSource) => {
	//			await pipeSourceToDestination(source, destination, config, trimPartitions);
	//		});
	//		return;
	//	}
	//	throw new Error('Not implemented yet');  // TODO
	//}
	//const configuredSource = await ConfiguredSource.fromSource(source, trimPartitions, legacyConfigure, config);
	//const stream = await configuredSource.createSparseReadStream();
	//const outputStream = await destination.createSparseWriteStream();

};

const main = async (input: string, output: string, configPath: string, trimPartitions: boolean): Promise<void> => {
	await Bluebird.using(
		getSource(input),
		FileDestination.createDisposer(output),
		getConfig(configPath),
		async (source: Source, destination: Destination, config: any): Promise<void> => {
			pipeSourceToDestination(source, destination, config, trimPartitions);
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
		console.error(error);
		process.exitCode = 1;
	}
};

wrapper();
