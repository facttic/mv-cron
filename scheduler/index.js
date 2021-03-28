// /* eslint camelcase:0 */
const schedule = require("node-schedule");
const { ManifestationDAO } = require("mv-models");
const queue = require("async/queue");
const redis = require("redis");

const { normalizeAndLogError } = require("../helpers/errors");
const { twitterWorker } = require("../workers/twitter");
const { instagramWorker } = require("../workers/instagram");
const { mediaCleanerWorker } = require("../workers/media_cleaner");

const { LoggerConfig } = require("../common/logger");
let logger;

const q = queue(async (task) => {
  try {
    return await task();
  } catch (err) {
    normalizeAndLogError("scheduler.js queue", err);
  }
}, 2);

// key: manifestation ID
// val: Set() of jobs scheduled
const jobs = new Map();

// 0. Hook updates listener
// 1. Get manifestations
// 2. Maybe Schedule jobs for manifestations
const init = async () => {
  logger = LoggerConfig.getChild("scheduler.js");
  hookUpdatesListener();

  const { list: manifestations } = await ManifestationDAO.getAll({});
  manifestations.forEach((manifestation) => maybeSchedule(manifestation));
};

const hookUpdatesListener = () => {
  try {
    const subscriber = redis.createClient();
    subscriber.subscribe("maninfestation-updates");

    subscriber.on("message", async (_channel, updatedManifestationId) => {
      logger.info(`[${updatedManifestationId}][Update] Manifestation was updated`);
      const manifestation = await ManifestationDAO.getById(updatedManifestationId);
      manifestation && maybeSchedule(manifestation);
    });
  } catch (err) {
    normalizeAndLogError("scheduler.js redis sub", err);
  }
};

// 0. Check if manifestations is active
// 1. Remove/cancel jobs from map if they exist
// 2. Schedule jobs for the active crons
const maybeSchedule = (manifestation) => {
  const { active } = manifestation;
  const key = manifestation.id.toString();
  cancelExistingSchedules(key);

  if (active) {
    const { twitter, instagram, mediaCleaner } = manifestation.config;

    twitter.active && scheduleManJob(manifestation, twitter, "TW", twitterWorker);
    instagram.active && scheduleManJob(manifestation, instagram, "IG", instagramWorker);
    mediaCleaner.active && scheduleManJob(manifestation, mediaCleaner, "MC", mediaCleanerWorker);
  }

  const jobsCount = countJobs();
  logger.info(`[${key}][Totals] ${jobsCount} job${jobsCount === 1 ? "" : "s"} running for ${jobs.size} manifestation${jobs.size === 1 ? "" : "s"}`);
};

const countJobs = () => {
  let jobsCount = 0;

  if (jobs.size > 0) {
    jobs.forEach(job => {
      jobsCount += job.size;
    })
  }
  return jobsCount;
};

const cancelExistingSchedules = (key) => {
  const jobsSet = jobs.get(key);
  jobs.delete(key);

  if (jobsSet) {
    for (let job of jobsSet) {
      logger.info(`[${key}][Cancel]${job.name} scheduler was successfully cancelled. Run time ${job.nextInvocation()}`);
      job.cancel();
    }
  }
};

// 0. Schedule jobs and push them workers to the queue
const scheduleManJob = (manifestation, config, type, workerFactory) => {
  const job = schedule.scheduleJob(`[${type}] ${manifestation.name}`, config.scheduleSchema, () => {
    // each workerFactory returns the async function
    // to be executed in the queue
    q.push(workerFactory(manifestation, config));
  });

  // if val exists a job was already sched
  // for the manifestation. Add it to set
  // Map.get() returns the existing Set or undefined
  const key = manifestation.id.toString();
  const jobsSet = jobs.get(key);

  jobs.set(key, jobsSet ? jobsSet.add(job) : new Set([job]));

  logger.info(`[${key}][Create]${job.name} scheduler was successfully created. Schema ${config.scheduleSchema}. Run time ${job.nextInvocation()}`);
};

module.exports = {
  SchedulerConfig: { init },
};
