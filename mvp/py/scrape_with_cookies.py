"""
Scrape Twitter timeline using existing cookies (no authentication needed)
Uses httpx to make direct API calls with your authenticated cookies
"""

import asyncio
import json
import sys
import httpx
from pathlib import Path


async def get_user_tweets(username: str, cookies_path: str, limit: int = 20):
    """Fetch user tweets using authenticated cookies"""
    
    # Load cookies
    with open(cookies_path, 'r') as f:
        cookies_list = json.load(f)
    
    # Convert to dict format for httpx
    cookies = {c['name']: c['value'] for c in cookies_list if 'x.com' in c.get('domain', '')}
    
    # Get CSRF token
    csrf_token = cookies.get('ct0', '')
    
    # Headers to mimic browser request
    headers = {
        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'x-csrf-token': csrf_token,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': 'en',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    tweets = []
    
    try:
        async with httpx.AsyncClient(cookies=cookies, headers=headers, timeout=30.0) as client:
            # First, get user ID from username
            user_url = f'https://api.x.com/graphql/qRednkZG--qQuM5M9vAY-Q/UserByScreenName'
            user_params = {
                'variables': json.dumps({
                    'screen_name': username.lstrip('@'),
                    'withSafetyModeUserFields': True
                }),
                'features': json.dumps({
                    'hidden_profile_subscriptions_enabled': True,
                    'rweb_tipjar_consumption_enabled': True,
                    'responsive_web_graphql_exclude_directive_enabled': True,
                    'verified_phone_label_enabled': False,
                    'subscriptions_verification_info_is_identity_verified_enabled': True,
                    'subscriptions_verification_info_verified_since_enabled': True,
                    'highlights_tweets_tab_ui_enabled': True,
                    'responsive_web_twitter_article_notes_tab_enabled': True,
                    'subscriptions_feature_can_gift_premium': True,
                    'creator_subscriptions_tweet_preview_api_enabled': True,
                    'responsive_web_graphql_skip_user_profile_image_extensions_enabled': False,
                    'responsive_web_graphql_timeline_navigation_enabled': True
                })
            }
            
            user_response = await client.get(user_url, params=user_params)
            print(f"[scraper] Response status: {user_response.status_code}")
            print(f"[scraper] Response text: {user_response.text[:500]}")
            user_data = user_response.json()
            
            user_id = user_data['data']['user']['result']['rest_id']
            print(f"[scraper] Found user ID: {user_id} for @{username}")
            
            # Now fetch tweets
            tweets_url = 'https://api.x.com/graphql/V1ze5q3ijDS1VeLwLY0m7g/UserTweets'
            tweets_params = {
                'variables': json.dumps({
                    'userId': user_id,
                    'count': limit,
                    'includePromotedContent': True,
                    'withQuickPromoteEligibilityTweetFields': True,
                    'withVoice': True,
                    'withV2Timeline': True
                }),
                'features': json.dumps({
                    'rweb_tipjar_consumption_enabled': True,
                    'responsive_web_graphql_exclude_directive_enabled': True,
                    'verified_phone_label_enabled': False,
                    'creator_subscriptions_tweet_preview_api_enabled': True,
                    'responsive_web_graphql_timeline_navigation_enabled': True,
                    'responsive_web_graphql_skip_user_profile_image_extensions_enabled': False,
                    'communities_web_enable_tweet_community_results_fetch': True,
                    'c9s_tweet_anatomy_moderator_badge_enabled': True,
                    'articles_preview_enabled': True,
                    'responsive_web_edit_tweet_api_enabled': True,
                    'graphql_is_translatable_rweb_tweet_is_translatable_enabled': True,
                    'view_counts_everywhere_api_enabled': True,
                    'longform_notetweets_consumption_enabled': True,
                    'responsive_web_twitter_article_tweet_consumption_enabled': True,
                    'tweet_awards_web_tipping_enabled': False,
                    'creator_subscriptions_quote_tweet_preview_enabled': False,
                    'freedom_of_speech_not_reach_fetch_enabled': True,
                    'standardized_nudges_misinfo': True,
                    'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled': True,
                    'rweb_video_timestamps_enabled': True,
                    'longform_notetweets_rich_text_read_enabled': True,
                    'longform_notetweets_inline_media_enabled': True,
                    'responsive_web_enhance_cards_enabled': False
                })
            }
            
            tweets_response = await client.get(tweets_url, params=tweets_params)
            tweets_data = tweets_response.json()
            
            # Parse tweets from response
            instructions = tweets_data['data']['user']['result']['timeline_v2']['timeline']['instructions']
            for instruction in instructions:
                if instruction.get('type') == 'TimelineAddEntries':
                    for entry in instruction.get('entries', []):
                        if entry.get('entryId', '').startswith('tweet-'):
                            try:
                                tweet_result = entry['content']['itemContent']['tweet_results']['result']
                                legacy = tweet_result.get('legacy', {})
                                
                                tweet_id = tweet_result.get('rest_id')
                                text = legacy.get('full_text', '')
                                created_at = legacy.get('created_at', '')
                                
                                tweets.append({
                                    'id': tweet_id,
                                    'url': f'https://x.com/{username}/status/{tweet_id}',
                                    'text': text,
                                    'date': created_at,
                                    'author': username.lstrip('@'),
                                    'likes': legacy.get('favorite_count', 0),
                                    'retweets': legacy.get('retweet_count', 0),
                                    'replies': legacy.get('reply_count', 0)
                                })
                            except (KeyError, TypeError) as e:
                                continue
            
            print(f"[scraper] Found {len(tweets)} tweets")
            
    except Exception as e:
        print(f"[scraper] Error: {e}")
        raise
    
    return tweets


async def main():
    if len(sys.argv) < 4:
        print("Usage: python scrape_with_cookies.py <username> <cookies_path> <output_file>")
        sys.exit(1)
    
    username = sys.argv[1]
    cookies_path = sys.argv[2]
    output_file = sys.argv[3]
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else 20
    
    tweets = await get_user_tweets(username, cookies_path, limit)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(tweets, f, ensure_ascii=False, indent=2)
    
    print(f"[scraper] Saved {len(tweets)} tweets to {output_file}")


if __name__ == '__main__':
    asyncio.run(main())

