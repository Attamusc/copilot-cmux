.PHONY: help install build test plugin-install plugin-list setup

help:
	@printf "Available targets:\n"
	@printf "  make install         Install npm dependencies\n"
	@printf "  make build           Build the plugin into dist/\n"
	@printf "  make test            Run the repository test suite\n"
	@printf "  make plugin-install  Install this plugin into Copilot CLI\n"
	@printf "  make plugin-list     List installed Copilot CLI plugins\n"
	@printf "  make setup           Install deps, build, and install the plugin\n"

install:
	npm install

build:
	npm run build

test:
	npm test

plugin-install:
	copilot plugin install ./

plugin-list:
	copilot plugin list

setup: install build plugin-install
