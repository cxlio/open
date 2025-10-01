set -e

tsc -b
cp license-* package.json ../dist/build

node ../dist/build "$@"

#esbuild index.ts --bundle --format=esm --tsconfig=tsconfig.json --platform=node --packages=external --outfile=../dist/build/index.js
