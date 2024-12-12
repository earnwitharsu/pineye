const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const colors = require("colors");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, updateEnv } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class PinEye {
  constructor() {
    this.baseURL = settings.BASE_URL;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://app.pineye.io",
      Referer: "https://app.pineye.io/",
      chatid: this.session_name,
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": '"Android"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
  }

  customHeaders(token = "") {
    const headers = this.headers;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  // this.wallets = this.loadWallets();

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async auth(userinfo) {
    const url = `${settings.BASE_URL}/v2/Login`;
    const payload = { userinfo };
    try {
      const response = await axios.post(url, payload, {
        headers: {
          ...this.customHeaders(),
        },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      this.log(`Error auth: ${error.message}`, "error");
      return null;
    }
  }

  async getProfile(token) {
    const url = `${this.baseURL}/v3/Profile/GetBalance`;

    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      this.log(`Error getProfile: ${error.message}`, "error");
      return null;
    }
  }

  async getBoosters(token) {
    const url = `${this.baseURL}/v1/Booster`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      this.log(`Lỗi rồi: ${error.message}`, "error");
      return null;
    }
  }

  async buyBooster(token, boosterId) {
    const url = `${this.baseURL}/v3/Profile/BuyBooster?boosterId=${boosterId}`;
    try {
      const response = await axios.post(url, null, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      this.log(`Không thể nâng cấp ${boosterId}: ${error.message}`, "error");
      return null;
    }
  }

  async manageBoosters(token, balance) {
    const boostersData = await this.getBoosters(token);
    if (!boostersData || !boostersData.data) {
      this.log("Không lấy được dữ liệu boosts!", "error");
      return;
    }

    for (const booster of boostersData.data) {
      while (balance >= booster.cost) {
        await sleep(2);

        const result = await this.buyBooster(token, booster.id);
        if (result && !result.errors) {
          this.log(`Nâng cấp ${booster.title} thành công. Balance còn: ${result.data.balance}`, "success");
          balance = result.data.balance;
        } else {
          this.log(`Không thể mua ${booster.title}.`, "warning");
          break;
        }
      }
    }
  }

  async tapEnergy(token, energy) {
    const url = `${this.baseURL}/v1/Tap?count=${energy}`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      if (response.data && !response.data.errors) {
        this.log(`Tap thành công | Balance: ${response.data.data.balance}`, "custom");
      }
    } catch (error) {
      this.log(`Không thể tap: ${error.message}`, "error");
    }
  }

  async dailyReward(token) {
    const url = `${this.baseURL}/v1/DailyReward`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      if (response.data && response.data.data && response.data.data.canClaim) {
        const claimUrl = `${this.baseURL}/v1/DailyReward/claim`;
        const claimResponse = await axios.post(claimUrl, null, {
          headers: this.customHeaders(token),
          timeout: 5000,
        });
        if (claimResponse.data && !claimResponse.data.errors) {
          this.log(`Điểm danh thành công | Balance: ${claimResponse.data.data.balance}`, "success");
        }
      } else {
        this.log("Hôm nay bạn đã điểm danh rồi!", "warning");
      }
    } catch (error) {
      this.log(`Không lấy được thông tin điểm danh: ${error.message}`, "error");
    }
  }

  log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}] [*] ${msg}`.green);
        break;
      case "custom":
        console.log(`[${timestamp}] [*] ${msg}`.magenta);
        break;
      case "error":
        console.log(`[${timestamp}] [!] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}] [*] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}] [*] ${msg}`.blue);
    }
  }

  async Countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`[${new Date().toLocaleTimeString()}] [*] Chờ ${i} giây để tiếp tục...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("");
  }

  extractFirstName(userinfo) {
    try {
      const decodedData = decodeURIComponent(userinfo);

      const userMatch = decodedData.match(/user=({.*?})/);
      if (userMatch && userMatch[1]) {
        const userObject = JSON.parse(userMatch[1]);

        return userObject.first_name;
      } else {
        this.log("Không lấy được firstname.", "warning");
        return "Unknown";
      }
    } catch (error) {
      this.log(`Không lấy được firstname: ${error.message}`, "error");
      return "Unknown";
    }
  }

  async checkAndBuyLottery(token) {
    const url = `${this.baseURL}/v1/Lottery`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      const { ticket } = response.data.data;
      if (!ticket.hasBuyed) {
        const buyTicketUrl = `${this.baseURL}/v1/Lottery/BuyTicket`;
        const buyResponse = await axios.post(buyTicketUrl, null, {
          headers: this.customHeaders(token),
          timeout: 5000,
        });
        const { code, balance } = buyResponse.data.data;
        this.log(`Mua thành công vé số ${code} | Balance còn: ${balance}`, "custom");
      } else {
        this.log(`Bạn đã mua vé số rồi: ${ticket.code}`, "warning");
      }
    } catch (error) {
      this.log(`Không thể mua vé số: ${error.message}`, "error");
    }
  }

  async getSocialTasks(token) {
    const url = `${this.baseURL}/v1/Social`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });

      return response.data.data.map((task) => ({
        id: task.id,
        title: task.title,
        score: task.score,
        isClaimed: task.isClaimed,
      }));
    } catch (error) {
      this.log(`Không thể lấy danh sách nhiệm vụ xã hội: ${error.message}`, "error");
      return [];
    }
  }

  async claimSocialTask(token, task) {
    const { id, title } = task;
    const url = `${this.baseURL}/v1/SocialFollower/claim?socialId=${id}`;
    try {
      const response = await axios.post(url, null, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      if (response.data && !response.data.errors) {
        this.log(`Làm nhiệm vụ thành công`, "success");
        return response.data.data;
      } else {
        this.log(`Không thể hoàn thành nhiệm vụ ${id} | ${title} : cần làm tay hoặc chưa đủ điều kiện`, "warning");
        return null;
      }
    } catch (error) {
      if (error.status == 400) this.log(`Không thể hoàn thành nhiệm vụ ${id} | ${title} : cần làm tay hoặc chưa đủ điều kiện`, "warning");
      else this.log(`Lỗi không thể hoàn thành nhiệm vụ ${id} | ${title} : ${error.message}`, "error");
      return null;
    }
  }

  async getPranaGameMarketplace(token) {
    const url = `${this.baseURL}/v1/PranaGame/Marketplace`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data.data;
    } catch (error) {
      this.log(`Không thể lấy danh sách thẻ: ${error.message}`, "error");
      return null;
    }
  }

  async dailyCombo(token) {
    const url = `${this.baseURL}/v1/DailySecretCode/ClaimReward?code=${settings.DAILY_COMBO_CODE.trim()}`;
    try {
      const response = await axios.post(url, null, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      if (response.data.data) {
        this.log(`Dailycombo completed successfully!`, "success");
      }
      return response.data.data;
    } catch (error) {
      if (error.status === 400) {
        this.log(`Wrong secrect code dailycombo!`, "warning");
      } else this.log(`Không thể dailyCombo: ${error.message}`, "error");
      return null;
    }
  }
  async handleDailyCombo(token) {
    const url = `${this.baseURL}/v1/DailySecretCode/CanClaimReward`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      const canClaim = response.data.data.canClaim;
      if (canClaim) {
        this.log(`Completing dailycombo...`);
        await this.dailyCombo(token);
      } else {
        this.log(`Combo daily is completed today!`, "warning");
      }
      return response.data.data;
    } catch (error) {
      this.log(`Không thể getPratice: ${error.message}`, "error");
      return null;
    }
  }

  async getPratice(token) {
    const url = `${this.baseURL}/v1/PranaGame/GetWeeklyPractice`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data.data;
    } catch (error) {
      this.log(`Không thể getPratice: ${error.message}`, "error");
      return null;
    }
  }
  async claimPratice(token) {
    const url = `${this.baseURL}/v1/PranaGame/ClaimPractice`;
    try {
      const response = await axios.get(url, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data.data;
    } catch (error) {
      this.log(`Không thể claimPratice: ${error.message}`, "error");
      return null;
    }
  }

  async handlePractice(token) {
    const data = await this.getPratice(token);
    const { practices } = data;
    if (practices && practices?.length > 0) {
      const taskDoing = practices.find((item) => item.status == "doing");
      if (taskDoing) {
        const todayPractice = taskDoing.days.find((item) => item.claimedStatus == "pending" && item.isCurrent);
        if (todayPractice) {
          this.log(`Starting practice: ${todayPractice.title}...`);
          this.log(`Wating ${todayPractice.practiceTime} seconds to claim ${todayPractice.title}`);
          await sleep(todayPractice.practiceTime);
          const res = await this.claimPratice(token);
          if (res?.isSuccess) {
            this.log(`Claimed practice today| Rewards: ${res.profit}`);
          }
        }
      }
    }
    return;
  }

  async purchasePranaGameCard(token, card) {
    const { id, currentLevel, cooldownEndTimestamp, cooldownTime } = card;

    if (cooldownTime > 0) {
      const now = Math.floor(Date.now());
      const secondsLeft = cooldownEndTimestamp - now;
      if (secondsLeft > 0) {
        const hours = Math.floor(secondsLeft / 3600);
        const minutes = Math.floor((secondsLeft % 3600) / 60);
        const seconds = secondsLeft % 60;
        this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId}): Còn ${hours} hours ${minutes} minutes ${seconds} seconds to continue upgrade...`, "warning");
        return;
      }
    }

    const url = `${this.baseURL}/v1/PranaGame/Purch?cardId=${id}&level=${currentLevel + 1}`;
    try {
      const response = await axios.post(url, null, {
        headers: this.customHeaders(token),
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async managePranaGameCards(token, balance) {
    const marketplaceData = await this.getPranaGameMarketplace(token);
    if (!marketplaceData) return;

    let maxCost = settings.MAX_COST_UPGRADE;
    let allCards = [];
    for (const category of marketplaceData.categories) {
      for (const collection of category.collections) {
        for (const card of collection.cards) {
          allCards.push({
            ...card,
            categoryId: category.id,
            collectionId: collection.id,
          });
        }
      }
    }

    allCards.sort((a, b) => b.profit - a.profit).filter((card) => card.currentLevel < card.maxLevel && !card.isCompleted);

    for (const card of allCards) {
      if (balance >= card.cost && card.cost <= maxCost && !card.isCompleted) {
        await sleep(2);
        const purchaseResult = await this.purchasePranaGameCard(token, card);
        if (purchaseResult && purchaseResult.data && purchaseResult.data.isSuccess) {
          balance = purchaseResult.data.balance;
          this.log(`Nâng cấp thẻ "${card.title}" thành công | Profit: ${card.profit} | Balance còn: ${balance}`, "success");
        }
      }
    }
  }

  async main() {
    console.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));

    const dataFile = path.join(__dirname, "data.txt");
    const data = fs.readFileSync(dataFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);

    const hoiturbo = settings.AUTO_UPGRADE_BOOSTER;
    const hoiveso = settings.AUTO_BUY_LOTTERY;
    const hoiPranaCards = settings.AUTO_BUY_PRANA;

    const { endpoint: baseURL, message } = await checkBaseUrl();
    console.log(`${message}`.yellow);
    if (!baseURL) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
    this.baseURL = baseURL;
    // process.exit(0);

    while (true) {
      for (let i = 0; i < data.length; i++) {
        const userinfo = data[i];
        const userData = JSON.parse(decodeURIComponent(userinfo.split("user=")[1].split("&")[0]));
        const userId = userData.id;
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        this.session_name = userId;
        this.headers["chatid"] = userId;

        console.log(`========== Tài khoản ${i + 1}/${data.length} | ${firstName + " " + lastName} ==========`.magenta);
        this.set_headers();

        const apiResponse = await this.auth(userinfo);
        if (apiResponse && apiResponse.data && apiResponse.data.token) {
          const token = apiResponse.data.token;
          const profileResponse = await this.getProfile(token);
          if (profileResponse && profileResponse.data) {
            let { totalBalance, level, earnPerTap } = profileResponse.data.profile;
            const { maxEnergy, currentEnergy } = profileResponse.data.energy;

            this.log(`Balance: ${totalBalance}`, "success");
            this.log(`Lv: ${level}`, "success");
            this.log(`Earn Per Tap: ${earnPerTap}`, "success");
            this.log(`Năng lượng: ${currentEnergy} / ${maxEnergy}`, "success");

            if (currentEnergy > 0) {
              await this.tapEnergy(token, currentEnergy);
              const updatedProfile = await this.getProfile(token);
              if (updatedProfile && updatedProfile.data) {
                totalBalance = updatedProfile.data.profile.totalBalance;
              }
            }

            await this.dailyReward(token);
            await this.handlePractice(token);
            if (settings.DAILY_COMBO) {
              await this.handleDailyCombo(token);
            }
            if (hoiturbo) {
              await this.manageBoosters(token, totalBalance);
            }
            if (hoiveso) {
              await this.checkAndBuyLottery(token);
            }

            if (hoiPranaCards) {
              await this.managePranaGameCards(token, totalBalance);
            }

            if (settings.AUTO_TASK) {
              const socialTasks = await this.getSocialTasks(token);
              const unclaimedTasks = socialTasks.filter((task) => !task.isClaimed && !settings.SKIP_TASKS.includes(task.id));
              for (const task of unclaimedTasks) {
                await sleep(2);
                this.log(`Nhận thưởng cho nhiệm vụ "${task.title}" (${task.score} điểm)`, "info");
                await this.claimSocialTask(token, task);
              }
            }
          } else {
            this.log(`Không lấy được dữ liệu: ${profileResponse ? profileResponse.errors : "No response data"}`, "error");
          }
        } else {
          this.log(`Đăng nhập thất bại: ${apiResponse ? apiResponse.errors : "No response data"}`, "error");
        }
      }
      await this.Countdown(settings.TIME_SLEEP * 60);
    }
  }
}

if (require.main === module) {
  const pineye = new PinEye();
  pineye.main().catch((err) => {
    console.error(err.toString().red);
    process.exit(1);
  });
}
