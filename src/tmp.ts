import { tmpdir } from 'os';
import * as Path from 'path';

import { open } from './fs';

const TMP_DIR = tmpdir();
const TRIES = 5;

const randomFilePath = (): string => {
	const i = Math.floor((Math.random() * 100000) + 1);
	return Path.join(TMP_DIR, `${i}.tmp`);
};

export interface TmpFileResult {
	path: string;
	fd: number;
}

export const file = async (): Promise<TmpFileResult> => {
	for (let i = 0; i < TRIES; i++) {
		const path = randomFilePath();
		try {
			const fd = await open(path, 'wx+');
			return { fd, path };
		} catch (error) {
			if (error.code !== 'EEXIST') {
				throw error;
			}
		}
	}
	throw new Error(`Could not generate a temporary filename in ${TRIES} tries`);
};
