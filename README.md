Installing
==========

Due to a bug in file-disk 1.0.1, you need to reinstall file-disk from the `record-discards` branch head.

```
npm i
rm -rf node_modules/file-disk
npm i npm i resin-io-modules/file-disk#record-discards
```

Running
=======

Download an `raspberry-pi` image at version `2.9.6+rev1.prod` from the `resin-staging-img` resin s3 bucket
using the configuration from `config.json` into the `resin.img` file.

`node index.js -i resin-s3://resin-staging-img/raspberry-pi/2.9.6+rev1.prod -o resin.img -c config.json`

Accepted protocols for the source:
 * file://
 * resin-s3://

The output only accepts a file path for now.

You can omit the config.

The config must be downloaded from the resin dashboard.
