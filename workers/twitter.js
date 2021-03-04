/* eslint camelcase:0 */
const Twitter = require("twitter");
const pify = require("pify");
const { PostDAO, DenyListDAO } = require("mv-models");

const { LoggerConfig } = require("../common/logger");

const twitterWorker = (manifestation, config) => async () => {
  twitterWorker.name = `TW worker for ${manifestation.name}`;
  const hashtags = manifestation.getAllHashtags();
  const lastTweetCrawlStatus = manifestation.getLastCrawlStatus("twitter");
  const { api } = config;

  let since_id = null;

  if (lastTweetCrawlStatus) {
    since_id = lastTweetCrawlStatus.post_id_str;
  }
  if (hashtags && hashtags.list && hashtags.list.length) {
    const client = new Twitter({
      consumer_key: api.consumerKey,
      consumer_secret: api.consumerSecret,
      access_token_key: api.accessTokenKey,
      access_token_secret: api.accessTokenSecret,
    });

    const hashtag_names = hashtags.list.map((h) => h.name);
    LoggerConfig.getChild(`${manifestation.name} twitter`).info(
      `[${manifestation._id.toString()}][TW] Start fetching for ${hashtag_names.join(",")}`,
    );
    return await getTweets(manifestation, client)(since_id, null, hashtag_names, config, 0);
  }
};

const splitString = (value, index) => {
  return [value.substring(0, index), value.substring(index)];
};

const options = {
  tweet_mode: "extended",
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
        // hashtags and media are filled
        // afterwards
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
    }
  }
  return myArrayOfTweets;
};

const getTweets = (manifestation, client) => async (
  sinceId,
  maxId,
  hashtags,
  config,
  tweetCount,
) => {
  let currentCount = tweetCount;
  const logger = LoggerConfig.getChild(`${manifestation.name} twitter`);
  const { maxTweetsPerQuery, maxTweets } = config;

  if (sinceId) {
    options.since_id = sinceId;
    delete options.max_id;
  } else if (maxId) {
    const maxIdLength = maxId.length;
    const [start, end] = splitString(maxId, maxIdLength - 4);
    const endInt = parseInt(end) - 1;
    options.max_id = `${start}${endInt}`;
  }

  options.count = maxTweetsPerQuery;
  options.q = `${hashtags.join(" OR ")} -filter:retweets -filter:replies filter:images`;

  const asyncGet = pify(client.get, { multiArgs: true }).bind(client);
  const [tweets, _response] = await asyncGet("search/tweets", options);

  if (tweets.statuses.length === 0) {
    logger.info(
      `[${manifestation._id.toString()}][TW] No (more) results found. Fetched ${currentCount}`,
    );
    return currentCount && (await manifestation.updatePeopleCount());
  }
  if (currentCount >= maxTweets) {
    logger.info(
      `[${manifestation._id.toString()}][TW] Hit max tweets soft limit: ${currentCount} >= ${maxTweets}`,
    );
    return currentCount && (await manifestation.updatePeopleCount());
  }

  const { statuses } = tweets;
  const myArrayOfTweets = await processStatuses(statuses, manifestation._id);
  await PostDAO.insertMany(myArrayOfTweets);
  currentCount += myArrayOfTweets.length;

  const { id_str: id_str_bottom } = statuses[statuses.length - 1];
  const { id_str: id_str_top, created_at: created_at_top } = statuses[0];

  await manifestation.newCrawlStatus({
    post_id_str: id_str_top,
    post_created_at: created_at_top,
    source: "twitter",
  });

  if (!sinceId) {
    logger.info(`[${manifestation._id.toString()}][TW] Looping from ${id_str_bottom}`);
    return await getTweets(manifestation, client)(
      sinceId,
      id_str_bottom,
      hashtags,
      config,
      currentCount,
    );
  }

  logger.info(`[${manifestation._id.toString()}][TW] Finished job. Fetched ${currentCount}`);
  return await manifestation.updatePeopleCount();
};

module.exports = { twitterWorker };
