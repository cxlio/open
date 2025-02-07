#!/usr/bin/env sh

for PLUGIN in rx tgz keyboard; do

	npm run build docs --prefix $PLUGIN

done