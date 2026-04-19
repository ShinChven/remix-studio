import { Type } from '@google/genai';
import path from 'path';
import fs from 'fs';

const dtsPath = require.resolve('@google/genai').replace('lib/index.js', 'src/types.d.ts'); // or somewhere
console.log(dtsPath);
