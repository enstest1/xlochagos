import { Page } from '@playwright/test';

/**
 * Detects and handles Cloudflare security check pages
 * Returns true if Cloudflare check was detected and handled, false otherwise
 */
export async function handleCloudflareCheck(page: Page, timeout: number = 30000): Promise<boolean> {
  try {
    // Check for Cloudflare security check indicators
    const hasCloudflare = await page.locator('text=Cloudflare').count() > 0;
    const hasVerifyHuman = await page.locator('text=Verify you are human').count() > 0;
    const hasVerifyCheckbox = await page.locator('input[type="checkbox"][name="cf-turnstile-response"]').count() > 0;
    const hasRayId = await page.locator('text=Ray ID').count() > 0;
    const hasEmailVerification = await page.locator('text=verify').count() > 0 && 
                                 (await page.locator('text=email').count() > 0 || 
                                  await page.locator('text=phone').count() > 0);
    
    // Also check URL for Cloudflare challenge
    const currentUrl = page.url();
    const isCloudflarePage = currentUrl.includes('challenges.cloudflare.com') || 
                            currentUrl.includes('account/access') ||
                            (hasCloudflare && hasRayId);

    if (isCloudflarePage || hasVerifyHuman || hasVerifyCheckbox || hasEmailVerification) {
      if (hasEmailVerification) {
        console.log('🚨 EMAIL/PHONE VERIFICATION REQUIRED - Account may be locked!');
        console.log('⚠️  Please check your email/phone and verify the account manually');
        console.log('⏸️  Keeping browser open for 30 seconds so you can verify...');
        await page.waitForTimeout(30000);
        return true;
      }
      console.log('🛡️  Cloudflare security check detected');
      
      // Try to find and click the checkbox
      try {
        // Look for various checkbox selectors
        const checkboxSelectors = [
          'input[type="checkbox"][name="cf-turnstile-response"]',
          'input[type="checkbox"]',
          '[role="checkbox"]',
          'label:has-text("Verify you are human")',
        ];

        let checkboxClicked = false;
        
        // Try clicking the checkbox using different methods
        for (const selector of checkboxSelectors) {
          try {
            const checkbox = page.locator(selector).first();
            const count = await checkbox.count();
            if (count > 0) {
              console.log(`✅ Found Cloudflare checkbox (${selector}), attempting to click...`);
              
              // Try multiple click methods
              try {
                // Method 1: Direct click
                await checkbox.click({ timeout: 5000, force: true });
                checkboxClicked = true;
                console.log('✅ Checkbox clicked successfully');
                break;
              } catch (clickError) {
                // Method 2: Click via label if checkbox is hidden
                try {
                  const label = page.locator(`label:has-text("Verify you are human")`).first();
                  if (await label.count() > 0) {
                    await label.click({ timeout: 5000 });
                    checkboxClicked = true;
                    console.log('✅ Checkbox clicked via label');
                    break;
                  }
                } catch (labelError) {
                  // Method 3: JavaScript click
                  try {
                    await checkbox.evaluate((el: any) => el.click());
                    checkboxClicked = true;
                    console.log('✅ Checkbox clicked via JavaScript');
                    break;
                  } catch (jsError) {
                    continue;
                  }
                }
              }
            }
          } catch (e) {
            // Try next selector
            continue;
          }
        }

        if (!checkboxClicked) {
          console.log('⚠️  Could not find or click checkbox automatically');
          console.log('💡 The browser window is visible - you can manually click the checkbox if needed');
          console.log('⏳ Waiting 10 seconds for manual intervention...');
          await page.waitForTimeout(10000);
        } else {
          // Wait a moment after clicking for Cloudflare to process
          await page.waitForTimeout(2000);
        }

        // Wait for Cloudflare check to complete (page should redirect or show content)
        console.log('⏳ Waiting for Cloudflare check to complete...');
        
        // Wait for either:
        // 1. URL to change (redirected away from challenge)
        // 2. Tweet elements to appear (successfully passed)
        // 3. Timeout
        
        try {
          await Promise.race([
            page.waitForURL((url) => {
              const urlString = url.toString();
              return !urlString.includes('challenges.cloudflare.com') && !urlString.includes('account/access');
            }, { timeout }),
            page.waitForSelector('[data-testid="tweet"]', { timeout }),
            page.waitForSelector('input[name="password"]', { timeout }), // Login page after check
          ]);
          
          console.log('✅ Cloudflare check appears to be completed');
          // Give it a moment to fully load
          await page.waitForTimeout(2000);
          return true;
        } catch (waitError) {
          console.log('⚠️  Cloudflare check may still be in progress or requires manual intervention');
          // Wait a bit longer for manual completion
          await page.waitForTimeout(5000);
          return true; // Return true anyway, let the calling code handle the next step
        }
      } catch (error) {
        console.log('❌ Error handling Cloudflare check:', error instanceof Error ? error.message : String(error));
        return true; // Still return true to indicate we detected it
      }
    }

    return false; // No Cloudflare check detected
  } catch (error) {
    console.log('⚠️  Error checking for Cloudflare:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

