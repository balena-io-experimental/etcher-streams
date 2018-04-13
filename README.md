Installing
==========

```
npm i
```

Running
=======

Download an `raspberrypi3` image at version `2.9.6+rev1.prod` from the `resin-staging-img` resin s3 bucket
using the configuration from `rpi3.config.json` into the `resin.img` file.

`node index.js -i resin-s3://resin-staging-img/raspberrypi3/2.9.6+rev1.prod -o resin.img -c rpi3.config.json -t`

Accepted protocols for the source:
 * file://    (path must be absolute, zip files are allowed)
 * resin-s3://

The output only accepts a file path for now.

You can omit the config.

The config must be downloaded from the resin dashboard, a sample config is provided in `rpi3.config.json`.

`-t` means trim the ext{2,3,4} partitions (discarded blocks won't be written on the destination).
