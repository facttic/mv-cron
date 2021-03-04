/* eslint camelcase:0 */
const bigInt = require("big-integer");
const { PostDAO, DenyListDAO } = require("mv-models");
const puppeteer = require("puppeteer");

const { LoggerConfig } = require("../common/logger");

const instagramWorker = (manifestation, config) => async () => {
  const hashtags = manifestation.getHashtagsBySource("instagram");
  const { username, password } = config.impersonate;

  if (hashtags && hashtags.list && hashtags.list.length) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
    );

    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    // Add a wait for some selector on the home page to load to ensure the next step works correctly
    await page.waitForSelector(`img[alt="${username}'s profile picture"]`);

    for (const hashtag of hashtags.list) {
      let since_id = null;
      const { name } = hashtag;
      const lastPostCrawlStatus = await manifestation.getLastCrawlStatusByHashtag(
        "instagram",
        hashtag,
      );

      if (lastPostCrawlStatus) {
        since_id = lastPostCrawlStatus.post_id_str;
      }

      LoggerConfig.getChild(`${manifestation.name} instagram`).info(
        `[${manifestation._id.toString()}][IG] Start fetching for ${name}`,
      );
      await getPosts(manifestation, page)(since_id, null, name, config, 0, false);
    }

    return await browser.close();
  }
};

const processEdges = async (edges, sinceId, manifestation_id) => {
  const myArrayOfPosts = [];

  for (const edge of edges) {
    const { node } = edge;
    if (sinceId && bigInt(node.id).lesserOrEquals(sinceId)) {
      return { myArrayOfPosts, foundLast: node.id };
    }

    const denyListed = await DenyListDAO.getByUserIdStr(node.owner.id);
    const exists = await PostDAO.getByPostIdStrBySource(node.id, "instagram");

    if (!denyListed && !exists) {
      const myUsefulPost = {
        post_created_at: node.taken_at_timestamp,
        post_id_str: node.id,
        full_text:
          node.edge_media_to_caption &&
          node.edge_media_to_caption.edges &&
          node.edge_media_to_caption.edges.length
            ? node.edge_media_to_caption.edges[0].node.text
            : "",
        hashtags: [],
        media: [
          {
            media_url: node.display_url,
            media_url_https: node.display_url,
            media_url_thumb: node.thumbnail_resources[0].src,
            media_url_small: node.thumbnail_resources[1].src,
            media_url_medium: node.thumbnail_resources[2].src,
            media_url_large: node.thumbnail_resources[3].src,
            sizes: {
              source: {
                w: node.dimensions.width,
                h: node.dimensions.height,
                resize: "fit",
              },
              thumb: {
                w: node.thumbnail_resources[0].config_width,
                h: node.thumbnail_resources[0].config_height,
                resize: "crop",
              },
              small: {
                w: node.thumbnail_resources[1].config_width,
                h: node.thumbnail_resources[1].config_height,
                resize: "crop",
              },
              medium: {
                w: node.thumbnail_resources[2].config_width,
                h: node.thumbnail_resources[2].config_height,
                resize: "crop",
              },
              large: {
                w: node.thumbnail_resources[3].config_width,
                h: node.thumbnail_resources[3].config_height,
                resize: "crop",
              },
            },
          },
        ],
        user: {
          id_str: node.owner.id,
          name: "",
          screen_name: "",
          location: "",
          profile_image_url: "",
          profile_image_url_https: `https://instagram.com/p/${node.shortcode}`,
        },
        geo: "",
        coordinates: "",
        manifestation_id,
      };

      myUsefulPost.source = "instagram";
      myArrayOfPosts.push(myUsefulPost);
    }
  }
  return { myArrayOfPosts, foundLast: false };
};

const getPosts = (manifestation, page) => async (
  sinceId,
  maxId,
  hashtag,
  config,
  postCount,
  insertedCrawlStatus,
) => {
  let currentCount = postCount;
  let currentInsertedCrawlStatus = insertedCrawlStatus;
  let url = `https://www.instagram.com/explore/tags/${hashtag}/?__a=1`;
  const logger = LoggerConfig.getChild(`${manifestation.name} instagram`);
  const { maxPosts } = config;

  if (maxId) {
    url += `&max_id=${maxId}`;
  }

  logger.info(`[${manifestation._id.toString()}][IG] Goto ${url}`);

  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector("pre");
  await page.waitForTimeout(1000);
  const pre = await page.$("pre");
  const value = await page.evaluate((el) => el.textContent, pre);
  const { graphql } = JSON.parse(value);
  let softLimit = false;

  if (!graphql || !graphql.hashtag || graphql.hashtag.edge_hashtag_to_media.count === 0) {
    logger.info(
      `[${manifestation._id.toString()}][IG] No (more) results found. Fetched ${currentCount}`,
    );
    return currentCount && (await manifestation.updatePeopleCount());
  }
  if (currentCount >= maxPosts) {
    logger.info(
      `[${manifestation._id.toString()}][IG] Hit max posts soft limit: ${currentCount} >= ${maxPosts}`,
    );
    softLimit = true;
  }

  const { page_info } = graphql.hashtag.edge_hashtag_to_media;
  const { edges } = graphql.hashtag.edge_hashtag_to_media;
  const { myArrayOfPosts, foundLast } = await processEdges(edges, sinceId, manifestation._id);
  currentCount += myArrayOfPosts.length;

  if (foundLast) {
    logger.info(
      `[${manifestation._id.toString()}][IG] Found the last post we had or a bigger one: ${foundLast}`,
    );
  }

  if (myArrayOfPosts.length) {
    await PostDAO.insertMany(myArrayOfPosts);

    if (!currentInsertedCrawlStatus) {
      const { id: id_str_top, taken_at_timestamp: post_created_at } = edges[0].node;
      await manifestation.newCrawlStatus({
        post_id_str: id_str_top,
        post_created_at,
        source: "instagram",
        hashtag,
      });
      currentInsertedCrawlStatus = true;
    }

    if (page_info.has_next_page && !foundLast && !softLimit) {
      return await getPosts(manifestation, page)(
        sinceId,
        page_info.end_cursor,
        hashtag,
        config,
        currentCount,
        currentInsertedCrawlStatus,
      );
    }
  }

  logger.info(`[${manifestation._id.toString()}][IG] Finished job. Fetched ${currentCount}`);
  return currentCount && (await manifestation.updatePeopleCount());
};

module.exports = { instagramWorker };
