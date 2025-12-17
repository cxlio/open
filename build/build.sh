set -e

tsc -b
cp license-* ../dist/build


node ../dist/build "$@"
npm run build package --prefix  ../spec-browser

mkdir -p ../dist/build/package
cp license-* ../dist/build/package
cp ../dist/build/eslint-config.js ../dist/build/package
cp ../node_modules/@cxl/3doc/3doc.js ../dist/build/package
cp ../node_modules/@cxl/3doc/hljs.css ../dist/build/package
cp ../dist/spec-browser/package/index.bundle.js ../dist/build/package/spec-browser.js

