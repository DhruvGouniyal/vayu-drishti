import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
Config.setOverwriteOutput(true);
// Canvas fire layers render faster with more parallel tabs; lower this if your PC runs out of memory.
Config.setConcurrency(null);
