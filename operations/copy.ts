const _ = require('lodash')
const Promise = require('bluebird')
const imagefs = require('resin-image-fs')

const copy = async (sourceFs, sourcePath, destinationFs, destinationPath) => {
	const readStream = sourceFs.createReadStream(`/${sourcePath}`)
	const writeStream = destinationFs.createWriteStream(`/${destinationPath}`)
	await new Promise((resolve, reject) => {
		readStream
		.on('error', reject)
		.pipe(writeStream)
		.on('error', reject)
		.on('close', resolve)
	})
}

exports.execute = async (operation, disk) => {
	const source = _.get(operation, 'from.partition')
	const destination = _.get(operation, 'to.partition')
	if (_.isUndefined(source) || _.isUndefined(destination)) {
		throw new Error('copy operation needs from and to properties')
	}
	if (source === destination) {
		await Promise.using(imagefs.interact(disk, source), async (fs) => {
			await copy(fs, operation.from.path, fs, operation.to.path)
		})
	} else {
		await Promise.using(imagefs.interact(disk, source), imagefs.interact(disk, destination), async (sourceFs, destinationFs) => {
			await copy(sourceFs, operation.from.path, destinationFs, operation.to.path)
		})
	}
}
