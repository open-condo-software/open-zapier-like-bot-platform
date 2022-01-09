#!/usr/bin/env bash

VERSION=$(node -e 'console.log(JSON.parse(require(`fs`).readFileSync(`${__dirname}/package.json`)).version)')
rm -rf ./dist
yarn build
git tag -a v${VERSION} -m "Publish ${VERSION}"
yarn publish
git push --tags origin master
