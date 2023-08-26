import * as core from '@actions/core'
import * as GitHub from '@actions/github'

import executeWebhook from './helpers/discord'
import DiscordWebhook, { EmbedField } from './helpers/discordTypes'

type JobData = {
  name: string
  status: string | null
  url: string
}

const { GITHUB_RUN_ID, GITHUB_WORKFLOW } = process.env

function workflowStatusFromJobs(jobs: JobData[]): 'Success' | 'Failure' | 'Cancelled' {
  let statuses = jobs.map(j => j.status)

  if (statuses.includes('cancelled')) {
    return 'Cancelled'
  }

  if (statuses.includes('failure')) {
    return 'Failure'
  }

  return 'Success'
}
async function run(): Promise<void> {
  try {
    if (GITHUB_RUN_ID == undefined) {
      core.setFailed('Unable to locate the current run id... Something is very wrong')
    } else {
      const githubToken = core.getInput('github-token', { required: true })
      const discordWebhook = core.getInput('discord-webhook', { required: true })
      const username = core.getInput('username')
      const avatarURL = core.getInput('avatar-url')
      const includeDetails = core.getInput('include-details').trim().toLowerCase() === 'true' || false
      const colorSuccess = parseInt(core.getInput('color-success').trim().replace(/^#/g, ''), 16)
      const colorFailure = parseInt(core.getInput('color-failure').trim().replace(/^#/g, ''), 16)
      const colorCancelled = parseInt(core.getInput('color-cancelled').trim().replace(/^#/g, ''), 16)

      const inputTitle = core.getInput('title')
      const inputDescription = core.getInput('description')

      core.setSecret(githubToken)
      core.setSecret(discordWebhook)

      const octokit = GitHub.getOctokit(githubToken)
      const context = GitHub.context

      octokit.rest.actions.listJobsForWorkflowRun({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: parseInt(GITHUB_RUN_ID, 10)
      })
      .then(response => {
        let workflowJobs = response.data.jobs

        // @ts-ignore
        let jobData: JobData[] = workflowJobs
                                  .filter(j => j.status === 'completed')
                                  .map(j => ({ name: j.name, status: j.conclusion, url: j.html_url }))

        let workflowStatus = workflowStatusFromJobs(jobData)

        let status = workflowStatus === 'Success' ? ':white_check_mark: Success' : (workflowStatus === 'Failure' ? ':no_entry: Failure' : ':grey_question: Cancelled')

        let color = workflowStatus === 'Success' ? colorSuccess : (workflowStatus === 'Failure' ? colorFailure : colorCancelled)

        let payload: DiscordWebhook = {
          username: username,
          avatar_url: avatarURL,
          embeds: [
            {
              author: {
                name: `${context.repo.owner}/${context.repo.repo}`,
                url: `https://github.com/${context.repo.owner}/${context.repo.repo}`,
                icon_url: `https://github.com/${context.repo.owner}.png`
              },
              title: inputTitle.replace('{{STATUS}}', workflowStatus) || `Workflow > [${GITHUB_WORKFLOW}]: ${status}`,
              url: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${GITHUB_RUN_ID}`,
              description: inputDescription.replace('{{STATUS}}', workflowStatus) || undefined,
              color: color
            }
          ]
        }

        if (includeDetails) {
          let fields: EmbedField[] = []

          jobData.forEach(jd => {
            fields.push({
              name: jd.name,
              value: `[\`${jd.status}\`](${jd.url})`,
              inline: true
            })
          })

          payload.embeds[0].fields = fields
        }

        executeWebhook(payload, discordWebhook)
      })
      .catch(error => {
        core.setFailed(error.message)
      })
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()