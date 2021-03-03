/* eslint camelcase:0 */
const Twitter = require("twitter");
const pify = require("pify");
const { PostDAO, DenyListDAO } = require("mv-models");

let maxTweets;
let maxtweetsPerQuery;

const twitterWorker = (manifestation, config) => async () => {
  const hashtags = manifestation.getAllHashtags();
  const lastTweetCrawlStatus = manifestation.getLastCrawlStatus("twitter");

  let since_id = null;

  if (lastTweetCrawlStatus) {
    since_id = lastTweetCrawlStatus.post_id_str;
  }
  if (hashtags && hashtags.list && hashtags.list.length) {
    const client = new Twitter({
      consumer_key: config.api.consumerKey,
      consumer_secret: config.api.consumerSecret,
      access_token_key: config.api.accessTokenKey,
      access_token_secret: config.api.accessTokenSecret,
    });
    maxTweets = config.maxTweets;
    maxtweetsPerQuery = config.maxTweetsPerQuery;

    const hashtag_names = hashtags.list.map((h) => h.name);
    resetTwitterCron();
    return await getTweets(manifestation, client)(since_id, null, hashtag_names);
  }
};

const splitString = (value, index) => {
  return [value.substring(0, index), value.substring(index)];
};

let tweetCount = 0;

const resetTwitterCron = () => {
  tweetCount = 0;
};

const options = {
  tweet_mode: "extended",
  count: maxtweetsPerQuery,
  include_entities: true,
};

const processStatuses = async (statuses, manifestation_id) => {
  const myArrayOfTweets = [];
  for (const tweet of statuses) {
    const denyListed = await DenyListDAO.getByUserIdStr(tweet.user.id_str);
    if (tweet.entities && tweet.entities.media && tweet.entities.media.length > 0 && !denyListed) {
      const myUsefulTweet = {
        post_created_at: parseInt(Date.parse(tweet.created_at) / 1000),
        post_id_str: tweet.id_str,
        full_text: tweet.full_text,
        hashtags: [],
        media: [],
        user: {
          id_str: tweet.user.id_str,
          name: tweet.user.name,
          screen_name: tweet.user.screen_name,
          location: tweet.user.location,
          profile_image_url: tweet.user.profile_image_url,
          profile_image_url_https: tweet.user.profile_image_url_https,
        },
        geo: tweet.geo,
        coordinates: tweet.coordinates,
        manifestation_id,
      };
      tweet.entities.media.forEach(function (m) {
        // eslint-disable-next-line no-useless-escape
        const [baseUrl, format] = m.media_url_https.split(/\.(?=[^\.]+$)/);
        myUsefulTweet.media.push({
          media_url: m.media_url,
          media_url_https: m.media_url_https,
          media_url_thumb: `${baseUrl}?format=${format}&name=thumb`,
          media_url_small: `${baseUrl}?format=${format}&name=small`,
          media_url_medium: `${baseUrl}?format=${format}&name=medium`,
          media_url_large: `${baseUrl}?format=${format}&name=large`,
          sizes: m.sizes,
        });
      });
      if (tweet.entities.hashtags && tweet.entities.hashtags.length > 0) {
        tweet.entities.hashtags.forEach(function (h) {
          myUsefulTweet.hashtags.push(h.text);
        });
      }
      myUsefulTweet.source = "twitter";
      myArrayOfTweets.push(myUsefulTweet);
      tweetCount++;
    }
  }
  return myArrayOfTweets;
};

const getTweets = (manifestation, client) => async (sinceId, maxId, hashtags) => {
  if (sinceId) {
    options.since_id = sinceId;
    delete options.max_id;
  } else if (maxId) {
    const maxIdLength = maxId.length;
    const [start, end] = splitString(maxId, maxIdLength - 4);
    const endInt = parseInt(end) - 1;
    options.max_id = `${start}${endInt}`;
  }

  options.q = `${hashtags.join(" OR ")} -filter:retweets -filter:replies filter:images`;

  const asyncGet = pify(client.get, { multiArgs: true }).bind(client);
  const [tweets, _response] = await asyncGet("search/tweets", options);

  if (tweets.statuses.length === 0) {
    return 0;
  }
  if (tweetCount >= maxTweets) {
    return tweetCount;
  }

  const { statuses } = tweets;
  const myArrayOfTweets = await processStatuses(statuses, manifestation._id);
  await PostDAO.insertMany(myArrayOfTweets);

  const { id_str: id_str_bottom } = statuses[statuses.length - 1];
  const { id_str: id_str_top, created_at: created_at_top } = statuses[0];

  await manifestation.newCrawlStatus({
    post_id_str: id_str_top,
    post_created_at: created_at_top,
    source: "twitter",
  });

  if (!sinceId) {
    return await getTweets(manifestation, client)(sinceId, id_str_bottom, hashtags);
  }

  await manifestation.updatePeopleCount();
  return tweetCount;
  // client.get("search/tweets", options, async function (error, tweets, response) {
  //   if (error) {
  //     console.log(
  //       `Processed ${tweetCount}. And got the error below. With the following options: ${JSON.stringify(
  //         options,
  //       )}`,
  //     );
  //     console.error(error);
  //     return;
  //   }
  //   if (tweets.statuses.length === 0) {
  //     console.log("We're still fetching tweets! But there was nothing new.");
  //     return;
  //   }
  //   if (tweetCount >= maxTweets) {
  //     console.log(`Hit maxTweets soft limit. Totals ${tweetCount}.`);
  //     return;
  //   }

  //   const { statuses } = tweets;
  //   const myArrayOfTweets = await processStatuses(statuses);

  //   PostDAO.insertMany(myArrayOfTweets)
  //     .then(async (tweetResults) => {
  //       const { id_str: id_str_bottom } = statuses[statuses.length - 1];
  //       const { id_str: id_str_top, created_at: created_at_top } = statuses[0];

  //       await PostCrawlStatusDAO.createNew({
  //         post_id_str: id_str_top,
  //         post_created_at: created_at_top,
  //         source: "twitter",
  //       });
  //       let users;
  //       if (!sinceId) {
  //         return getTweets(sinceId, id_str_bottom, hashtags);
  //       } else {
  //         users = await PostUserDAO.saveCount();
  //       }
  //       console.log(
  //         `We're still fetching tweets! Inserted ${tweetResults.insertedCount}. Total users: ${
  //           users && users.count
  //         }`,
  //       );
  //     })
  //     .catch((err) => {
  //       console.log("Something failed at saving many. And got the error below");
  //       console.error(err);
  //     });
  // });
};

module.exports = { twitterWorker };
