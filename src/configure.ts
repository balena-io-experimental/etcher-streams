import * as Promise from 'bluebird';
import * as _ from 'lodash';
import { getPartitions } from 'partitioninfo';
import { interact } from 'resin-image-fs';

// This code comes from resin-image maker, converted to typescript and dropped Edison zip archive support.

const PARTITION_FIELDS = ['partition', 'to.partition', 'from.partition'];
const MBR_LAST_PRIMARY_PARTITION = 4;

const executeOperation = async (operation, disk) => {
	const operationModule = require('./operations/' + operation.command);
	return await operationModule.execute(operation, disk);
};

const getPartitionIndex = (partition) => {
	// New device-type.json partition format: partition index
	if (_.isNumber(partition)) {
		return partition;
	}
	// Old device-type.json partition format: { primary: 4, logical: 1 }
	if (_.isNumber(partition.logical)) {
		return partition.logical + MBR_LAST_PRIMARY_PARTITION;
	}
	// Old device-type.json partition format: { primary: 4 }
	if (_.isNumber(partition.primary)) {
		return partition.primary;
	}
	throw new Error(`Invalid partition: ${partition}`);
};

const getDiskDeviceType = async (disk) => {
	const partitions = await getPartitions(disk);
	for (const partition of partitions.partitions) {
		if (partition.type === 14) {
			const deviceType = await Promise.using(interact(disk, partition.index), async (fs) => {
				return await fs.readFileAsync('/device-type.json').catchReturn();
			});
			if (deviceType) {
				return JSON.parse(deviceType);
			}
		}
	}
};

export const configure = async (disk, options = {}) => {
	const deviceType = await getDiskDeviceType(disk);
	console.log('device type read from disk image:\n', JSON.stringify(deviceType, null, 4));
	let operations = _.cloneDeep(_.get(deviceType, 'configuration.operations', []));
	const config = _.get(deviceType, 'configuration.config');

	if (config) {
		operations.push({
			command: 'configure',
			partition: config.partition,
			data: options.config,
		});
	}

	operations = operations.filter((operation) => {
		if (_.isObject(operation.when)) {
			for (key in operation.when) {
				if (options[key] !== operations.when[key]) {
					return false;
				}
			}
		}
		return true;
	});

	for (const operation of operations) {
		for (const field of PARTITION_FIELDS) {
			const partition = _.get(operation, field);
			if (partition) {
				_.set(operation, field, getPartitionIndex(partition));
			}
		}
	}

	await Promise.each(operations, async (operation) => {
		await executeOperation(operation, disk);
	});
};
