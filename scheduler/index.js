// /* eslint camelcase:0 */
const schedule = require("node-schedule");
const { ManifestationDAO, ManifestationEmmiter } = require("mv-models");
const queue = require("async/queue");

const { normalizeAndLogError } = require("../helpers/errors");
const { twitterWorker } = require("../workers/twitter");
const { instagramWorker } = require("../workers/instagram");
const { mediaCleanerWorker } = require("../workers/media_cleaner");

const q = queue(async (task) => {
  try {
    await task();
  } catch (err) {
    normalizeAndLogError("scheduler.js queue", err);
  }
}, 2);

// 0. Get manifestations
// 1. Evaluate if they're active
// 2. Schedule jobs for each active worker
const init = async () => {
  const { list: manifestations } = await ManifestationDAO.getAll({});
  ManifestationEmmiter.on("update", () => {
    console.log("A");
  });
  manifestations.forEach((manifestation) => {
    const { twitter, instagram, mediaCleaner } = manifestation.config;
    const { active } = manifestation;

    // TODO: hook manifestation changes or creations
    // to remove, add or delete scheduled manJobs
    if (active) {
      twitter.active && scheduleManJob(manifestation, twitter, twitterWorker);
      instagram.active && scheduleManJob(manifestation, instagram, instagramWorker);
      mediaCleaner.active && scheduleManJob(manifestation, mediaCleaner, mediaCleanerWorker);
    }
  });
};

// Schedule jobs and push them workers to the queue
const scheduleManJob = (manifestation, config, worker) => {
  const job = schedule.scheduleJob(manifestation.name, config.scheduleSchema, async () => {
    // TODO: is this closure leaking?
    // if this job is waiting, skip <- review
    if (job.pendingInvocations().length <= 1) {
      q.push(worker(manifestation, config));
    }
  });
};

module.exports = {
  SchedulerConfig: { init },
};
