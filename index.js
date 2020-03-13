const core = require('@actions/core');
const github = require('@actions/github');
const asana = require('asana');

async function asanaOperations(
  asanaPAT,
  targets,
  taskId,
  taskComment
) {
  try {
    const client = asana.Client.create({
      defaultHeaders: { 'asana-enable': 'new-sections,string_ids' },
      logAsanaChangeWarnings: false
    }).useAccessToken(asanaPAT);

    const task = await client.tasks.findById(taskId);
    
    targets.forEach(async target => {
      let targetProject = task.projects.find(project => project.name === target.project);
      if (targetProject) {
        let targetSection = await client.sections.findByProject(targetProject.gid)
          .then(sections => sections.find(section => section.name === target.section));
        if (targetSection) {
          await client.sections.addTask(targetSection.gid, { task: taskId });
          core.info(`Moved to: ${target.project}/${target.section}`);
        } else {
          core.error(`Asana section ${target.section} not found.`);
        }
      } else {
        core.info(`This task does not exist in "${target.project}" project`);
      }
    });

    if (taskComment) {
      await client.tasks.addComment(taskId, {
        text: taskComment
      });
      core.info('Added the pull request link to the Asana task.');
    }
  } catch (error) {
    core.error(error.value);
  }
}

async function run() {
  try {
    const GITHUB_TOKEN = core.getInput('github-token');
      ASANA_PAT = core.getInput('asana-pat'),
      TARGETS = core.getInput('targets'),
      TRIGGER_PHRASE = core.getInput('trigger-phrase'),
      TASK_COMMENT = core.getInput('task-comment'),
      PULL_REQUEST = github.context.payload.pull_request,
      REGEX_STRING = `${TRIGGER_PHRASE}(?:\s*)https:\\/\\/app.asana.com\\/(\\d+)\\/(?<project>\\d+)\\/(?<task>\\d+)`,
      REGEX = new RegExp(REGEX_STRING,'g'),
      LINK_REQUIRED = core.getInput('link-required')
    ;

    const octokit = new github.GitHub(GITHUB_TOKEN);

    core.debug(`Regex: ${REGEX_STRING}`);
    // contains the markdown version of the PR
    core.debug(`pr body: ${PULL_REQUEST.body}`);

    let taskComment = null,
      targets = TARGETS ? JSON.parse(TARGETS) : [],
      parseAsanaURL = null;

    if (!ASANA_PAT){
      throw({message: 'ASANA PAT Not Found!'});
    }
    if (TASK_COMMENT) {
      taskComment = `${TASK_COMMENT} ${PULL_REQUEST.html_url}`;
    }

    let foundAsanaTasks = [];
    while ((parseAsanaURL = REGEX.exec(PULL_REQUEST.body)) !== null) {
      let taskId = parseAsanaURL.groups.task;
      if (taskId) {
        foundAsanaLink = true;
        asanaOperations(ASANA_PAT, targets, taskId, taskComment);
        foundAsanaTasks.push(taskId);
      } else {
        core.error(`Invalid Asana task URL after the trigger phrase ${TRIGGER_PHRASE}`);
      }
    }

    if(LINK_REQUIRED){
      const statusState = (foundAsanaTasks.length > 0) ? 'success' : 'error';
      core.info(`setting ${statusState} for ${github.context.sha}`);
      core.info(`payload body ${JSON.stringify(github.context.payload.pull_request)}`);
      octokit.repos.createStatus({
        ...github.context.repo,
        'context': 'asana-link-presence',
        'state': statusState,
        'description': 'asana link not found',
        'sha': github.context.payload.pull_request.head.sha,
      });
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run()