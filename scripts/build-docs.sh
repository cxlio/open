#!/usr/bin/env sh

for PLUGIN in rx tgz keyboard component glob; do

	npm run build docs --prefix $PLUGIN

done