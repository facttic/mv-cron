// /* eslint camelcase:0 */
// const puppeteer = require("puppeteer");

// const { getTweets, resetTwitterCron } = require("./twitter");
// const { getPosts, resetInstagramCron } = require("./instagram");
// const { cleanPostsMedia } = require("./media_cleaner");
// const { PostCrawlStatusDAO, HashtagDAO } = require("mv-models");
const schedule = require("node-schedule");
const { ManifestationDAO } = require("mv-models");
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
    // if this job is waiting, skip
    if (job.pendingInvocations().length <= 1) {
      q.push(worker(manifestation, config));
    }
  });
};

module.exports = {
  SchedulerConfig: { init },
};

// class SchedulerConfig {
//   static async init() {
//     if (process.env.MEDIA_CLEANER && process.env.MEDIA_CLEANER === "true") {
//       schedule.scheduleJob(process.env.MEDIA_CLEANER_CRON_SCHEDULE || "59 23 * * 0", async () => {
//         try {
//           cleanPostsMedia(0);
//           console.log("Clean tweets scheduled");
//         } catch (err) {
//           console.error(err);
//         }
//       });
//     } else {
//       console.log(
//         ".env variable MEDIA_CLEANER was not set to 'true' or undefined. CRON to clean medias will not run.",
//       );
//     }

//     async function processHashtags(hashtags, page) {
//       for (const hashtag of hashtags) {
//         let since_id = null;
//         const { name } = hashtag;
//         const lastPostCrawlStatus = await PostCrawlStatusDAO.getLastByHashtag("instagram", name);
//         if (lastPostCrawlStatus) {
//           since_id = lastPostCrawlStatus.post_id_str;
//         }
//         console.log(
//           `Instagram CRON: running for hashtag ${name}.${
//             since_id ? ` Starting at id: ${since_id}` : ""
//           }`,
//         );
//         resetInstagramCron();
//         await getPosts(since_id, null, name, page);
//       }
//     }

//     if (process.env.INSTAGRAM_CRON_ACTIVE && process.env.INSTAGRAM_CRON_ACTIVE === "true") {
//       schedule.scheduleJob(`*/${process.env.INSTAGRAM_CRON_TIMELAPSE || 5} * * * *`, async () => {
//         try {
//           const hashtags = await HashtagDAO.getBySource("instagram");

//           if (hashtags && hashtags.list && hashtags.list.length) {
//             const browser = await puppeteer.launch();
//             const page = await browser.newPage();

//             await page.setUserAgent(
//               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
//             );

//             await page.goto("https://www.instagram.com/accounts/login/", {
//               waitUntil: "networkidle2",
//             });

//             await page.waitForSelector('input[name="username"]');
//             await page.type('input[name="username"]', igUsername);
//             await page.type('input[name="password"]', igPassword);
//             await page.click('button[type="submit"]');
//             // Add a wait for some selector on the home page to load to ensure the next step works correctly
//             await page.waitForSelector(`img[alt="${igUsername}'s profile picture"]`);
//             const result = await processHashtags(hashtags.list, page);

//             console.log("closing browser");
//             await browser.close();
//             return result;
//           } else {
//             console.log(
//               "Instagram CRON: No hashtags are present in the DDBB. Please add some for the process to run.",
//             );
//           }
//         } catch (err) {
//           console.error(err);
//         }
//       });
//     } else {
//       console.log(
//         ".env variable INSTAGRAM_CRON_ACTIVE was not set to 'true' or undefined. CRON to fetch Instagram posts will not run.",
//       );
//     }
//   }
// }

// module.exports = { SchedulerConfig };
