"""
CHOAI Framework - X Browser Tool

This module provides functionality for interacting with X.com (formerly Twitter)
through browser automation interface.
"""

import os
import logging
import random
from typing import List, Callable, Dict, Any, Optional
from selenium.webdriver import Keys, ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from src.agent_tools.utils.tool_utils import AutogenAgentTool
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver import Firefox
import time

class XBrowserTool(AutogenAgentTool):
    """Tool for automating X (Twitter) browser interactions."""
    
    MAX_POST_LENGTH = 277  # Maximum post length including hashtags
    TYPING_DELAY_MIN = 0.02  # Minimum delay between characters
    TYPING_DELAY_MAX = 0.05  # Maximum delay between characters
    
    def __init__(self, logger=None):
        """Initialize the browser tool."""
        super().__init__(name="XBrowserTool")
        self.logger = logger or logging.getLogger(__name__)
        self.cookies = None
        self.browser = None

    def initialize_browser(self) -> bool:
        """Initialize and return a Selenium WebDriver instance."""
        try:
            options = FirefoxOptions()
            options.add_argument("--auto-open-devtools-for-tabs")
            options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
            service = FirefoxService(r"C:\Windows\System32\geckodriver.exe")

            self.browser = Firefox(service=service, options=options)
            self.logger.info("Browser initialized successfully.")

            if self.cookies:
                self.browser.get("https://x.com/home")
                self.load_cookies()
                self.browser.get("https://x.com/home")
                self.wait_for_url("https://x.com/home")
            return True
        except Exception as e:
            self.logger.error(f"Failed to initialize browser: {str(e)}")
            return False

    def wait_for_element(self, by, value, timeout=30) -> WebElement:
        """Wait for an element to be present in the DOM."""
        self.logger.info(f"Waiting for element by {by} with value {value} for up to {timeout} seconds.")
        try:
            element = WebDriverWait(self.browser, timeout).until(
                lambda driver: driver.find_element(by, value)
            )
            self.logger.info(f"Element by {by} with value {value} found.")
            return element
        except Exception as e:
            self.logger.error(f"Error waiting for element by {by} with value {value}: {e}")
            raise

    def wait_for_url(self, url, timeout=30):
        """Wait for the browser to be at a specific URL."""
        self.logger.info(f"Waiting for browser to be at URL: {url} for up to {timeout} seconds.")
        try:
            WebDriverWait(self.browser, timeout).until(
                lambda driver: driver.current_url == url
            )
            self.logger.info(f"Browser is at URL: {url}.")
        except Exception as e:
            self.logger.error(f"Error waiting for browser to be at URL: {url}: {e}")
            raise

    def close_browser(self) -> bool:
        """Close the Selenium WebDriver instance."""
        try:
            if self.browser:
                self.browser.quit()
                self.browser = None
            return True
        except Exception as e:
            return False

    def save_cookies(self):
        """Save browser cookies."""
        if self.browser and not self.cookies:
            self.cookies = self.browser.get_cookies()

    def load_cookies(self):
        """Load saved cookies to browser."""
        if self.browser and self.cookies:
            for cookie in self.cookies:
                self.browser.add_cookie(cookie)

    def login(self) -> bool:
        """Log in to X using credentials from environment variables."""
        if not self.browser:
            self.initialize_browser()

        try:
            print("\n🔄 Adding delay before login attempt...")
            time.sleep(5)  # Reduced to 5 seconds for login
            
            self.browser.get("https://x.com/i/flow/login")
            self.wait_for_url("https://x.com/i/flow/login")

            self.logger.info("Logging in to X.")
            
            # Initial email/username input
            print("\n🔄 Adding delay before entering username...")
            time.sleep(5)  # Reduced to 5 seconds for login
            
            username_field = self.wait_for_element(
                By.XPATH,
                '//input[@name="text" and @autocomplete="username"]')
            username_field.send_keys(os.getenv('X_EMAIL'))
            username_field.send_keys(Keys.RETURN)
            
            # Check specifically for the verification popup
            try:
                # Wait for the verification popup heading
                verification_heading = WebDriverWait(self.browser, 5).until(
                    lambda driver: driver.find_element(
                        By.XPATH,
                        "//span[contains(text(), 'Enter your phone number or username')]"
                    )
                )
                
                if verification_heading:
                    self.logger.info("Verification popup detected.")
                    print("\n🔄 Adding delay before verification...")
                    time.sleep(5)  # Reduced to 5 seconds for login
                    
                    # Now find and fill the verification input
                    verification_field = self.wait_for_element(
                        By.XPATH,
                        '//input[@data-testid="ocfEnterTextTextInput"]'
                    )
                    verification_field.send_keys(os.getenv('X_USERNAME'))
                    verification_field.send_keys(Keys.RETURN)
                    self.logger.info("Handled additional verification step.")
            except Exception as e:
                # If the verification popup isn't found, continue normally
                self.logger.info("No verification popup detected, proceeding normally.")
                pass

            # Password input
            print("\n🔄 Adding delay before entering password...")
            time.sleep(5)  # Reduced to 5 seconds for login
            
            password_field = self.wait_for_element(
                By.XPATH,
                '//input[@name="password" and @autocomplete="current-password"]')
            password_field.send_keys(os.getenv('X_PASSWORD'))
            password_field.send_keys(Keys.RETURN)

            self.wait_for_url("https://x.com/home")
            self.save_cookies()

            return True
        except Exception as e:
            self.logger.error(f"Error logging in to X: {str(e)}")
            return False

    def _type_with_delay(self, element: WebElement, text: str):
        """Type text with random delays between characters for more human-like behavior.
        
        Args:
            element: WebElement to type into
            text: Text to type
        """
        actions = ActionChains(self.browser)
        actions.move_to_element(element).click().perform()
        
        for char in text:
            delay = random.uniform(self.TYPING_DELAY_MIN, self.TYPING_DELAY_MAX)
            actions.send_keys(char).perform()
            time.sleep(delay)

    def _process_content_with_hashtags(self, message: str, add_hashtags: bool = True) -> str:
        """Process content and optionally add hashtags while respecting character limit.
        
        Args:
            message: Original message to process
            add_hashtags: Whether to add hashtags (default: True)
            
        Returns:
            Processed message within character limit
        """
        # Extract existing hashtags if any
        existing_hashtags = set(word for word in message.split() if word.startswith('#'))
        
        # Remove existing hashtags for length calculation
        content_without_hashtags = ' '.join(word for word in message.split() 
                                          if not word.startswith('#')).strip()
        
        # If content is already too long, truncate it
        if len(content_without_hashtags) > self.MAX_POST_LENGTH:
            return content_without_hashtags[:self.MAX_POST_LENGTH - 3] + "..."
            
        # If we don't want hashtags or already have them, return as is
        if not add_hashtags or existing_hashtags:
            return message[:self.MAX_POST_LENGTH]
            
        # Extract potential hashtag words (nouns and key terms)
        words = content_without_hashtags.split()
        potential_hashtags = [word.strip('.,!?') for word in words 
                            if len(word) > 3 and word[0].isupper()]
        
        # Select up to 2 hashtags
        selected_hashtags = []
        if potential_hashtags:
            num_hashtags = min(2, len(potential_hashtags))
            selected_hashtags = random.sample(potential_hashtags, num_hashtags)
        
        # Combine content with hashtags if there's room
        final_content = content_without_hashtags
        remaining_length = self.MAX_POST_LENGTH - len(final_content)
        
        for hashtag in selected_hashtags:
            hashtag_text = f" #{hashtag}"
            if len(hashtag_text) + 1 <= remaining_length:
                final_content += hashtag_text
                remaining_length -= len(hashtag_text)
            else:
                break
                
        return final_content

    def post(self, message: str, add_hashtags: bool = False) -> Dict[str, Any]:
        """Post a message to X with human-like typing behavior."""
        if not self.browser:
            self.initialize_browser()

        try:
            print("\n🔄 Adding delay before navigating to home...")
            time.sleep(3)
            
            self.browser.get("https://x.com/home")
            if 'login' in self.browser.current_url or 'logout' in self.browser.current_url:
                self.login()

            print("\n🔄 Adding delay before navigating to compose...")
            time.sleep(3)
            
            self.browser.get("https://x.com/compose/post")
            
            # Ensure we're at the top of the page
            self.browser.execute_script("window.scrollTo(0, 0)")
            
            # Wait for and find the compose box with improved selector
            post_field = self.wait_for_element(
                By.CSS_SELECTOR,
                'div[data-testid="tweetTextarea_0"]'  # Updated selector
            )
            
            # Ensure the element is in view and focused
            self.browser.execute_script("arguments[0].scrollIntoView(true);", post_field)
            time.sleep(1)  # Short pause after scroll
            
            # Use the message exactly as provided - no additional processing
            tweet_content = message[:280] if len(message) > 280 else message
            
            print("\n🔄 Adding delay before typing content...")
            time.sleep(3)
            
            # Focus the element and type content
            post_field.click()  # Ensure focus
            self._type_with_delay(post_field, tweet_content)
            
            print("\n🔄 Adding delay before clicking post button...")
            time.sleep(3)
            
            # Find post button with more reliable selector
            post_button = self.wait_for_element(
                By.XPATH,
                '//button[@role="button" and @data-testid="tweetButton" and not(@aria-disabled="true")]'
            )
            
            # Ensure button is in view before clicking
            self.browser.execute_script("arguments[0].scrollIntoView(true);", post_button)
            time.sleep(1)  # Short pause after scroll
            
            # Click the button
            post_button.click()
            
            print("\n🔄 Adding delay before final checks...")
            time.sleep(3)
            
            self.wait_for_url("https://x.com/home")
            self.save_cookies()
            
            return {
                "status": "success",
                "message": "Successfully posted to X",
                "content": tweet_content
            }
        except Exception as e:
            self.logger.error(f"Error posting message: {str(e)}")
            return {
                "status": "error",
                "message": str(e),
                "content": message
            }
        finally:
            self.close_browser()

    async def process_and_post_summary(self, content: str, add_hashtags: bool = True) -> Dict[str, Any]:
        """Process and post a summary to X.com.
        
        Args:
            content: The content to process and post
            add_hashtags: Whether to add hashtags (default: True)
            
        Returns:
            Dict containing status and result of posting operation
        """
        try:
            if not content:
                return {
                    "status": "error",
                    "message": "No content provided to post"
                }
                
            # Post the content exactly as provided - no additional processing
            self.logger.info("Posting content as is...")
            result = self.post(content, add_hashtags=False)  # Disable hashtag processing
            
            return result  # Return the result directly from post method
                
        except Exception as e:
            error_msg = f"Error processing and posting content: {str(e)}"
            self.logger.error(error_msg)
            return {
                "status": "error",
                "message": error_msg,
                "content": content
            }

    @classmethod
    def get_tools(cls, instance: 'AutogenAgentTool') -> List[Callable]:
        """Get the list of available tools."""
        return [
            instance.post,
            instance.process_and_post_summary
        ]

    def __del__(self):
        """Ensure browser is closed when object is destroyed."""
        self.close_browser()