set -e

tsc -b
cp license-* package.json ../dist/build

node ../dist/build "$@"

mkdir -p ../dist/build/package
cp license-* package.json ../dist/build/package
cp ../dist/build/eslint-config.js ../dist/build/package

