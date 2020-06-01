const core = require('@actions/core');
require('./action');

async function run() {
  try {
    await action();
  } catch (error) {
    core.setFailed(error.message);
  }
}

run()