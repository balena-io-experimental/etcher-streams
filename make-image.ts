import { S3 } from 'aws-sdk'
import * as Promise from 'bluebird'
import * as _ from 'lodash'
import * as fs from 'mz/fs'
import * as commander from 'commander'
import * as Path from 'path'
import * as progress from 'stream-progressbar'
import { parse as urlParse } from 'url'

import { ConfiguredSource } from './configured-source'
import { ResinS3Source } from './resin-s3-source'
import { FileSource } from './file-source'

import { version } from './package.json'

const s3 = new S3({
	accessKeyId: null,
	secretAccessKey: null,
	s3ForcePathStyle: true,
	sslEnabled: false,
})

// Make it work without accessKeyId and secretAccessKey
for (let key of [ 'getObject', 'headObject' ]) {
	s3[key] = (...args) => {
		return s3.makeUnauthenticatedRequest(key, ...args)
	}
}

const getSource = (url) => {
	let { protocol, host, path } = urlParse(url)
	if (protocol === null) {
		// No protocol: assuming local file
		protocol = 'file:'
		path = Path.resolve(path)
	}
	if (protocol === 'file:') {
		// file:///absolute/path/to/resin.img
		return new FileSource(path)
	} else if (protocol === 'resin-s3:') {
		// resin-s3://resin-staging-img/raspberry-pi/2.9.6+rev1.prod
		const bucket = host
		const [ deviceType, version ] = path.slice(1).split('/')
		return new ResinS3Source(s3, bucket, deviceType, version)
	}
	throw new Error(`Unsupported source: ${url}`)
}

const main = async (input, output, configPath) => {
	let source = getSource(input)
	const outputStream = fs.createWriteStream(output)
	const config = require('./' + configPath)

	if (!_.isUndefined(config)) {
		source = await ConfiguredSource.fromSource(source, config)
	}

	const metadata = await source.getMetadata()
	const stream = await source.createReadStream({})
	stream
	.pipe(progress('[:bar] :current / :total bytes ; :percent', {total: metadata.size, width: 40}))
	.pipe(outputStream)

	await new Promise((resolve, reject) => {
		outputStream.on('close', resolve)
		outputStream.on('error', reject)
		stream.on('error', reject)
	})
}

commander
.version(version)
.option('-i', '--input <input>', 'Input URL (file:// and resin-s3:// URLs are accepted')
.option('-o', '--output <output>', 'Output file path')  // TODO: accept URLs, use Destination class
.option('-c', '--config [config]', 'Config file path (get a config from dashboard.resin.io)')
.action(main)
.parse(process.argv)
