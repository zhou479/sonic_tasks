const fs = require('fs');
const solana = require('@solana/web3.js');
const base58 = require('bs58');
const { faker } = require('@faker-js/faker');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');
const TwoCaptcha = require("@2captcha/captcha-solver");
const logger = require('./setup_log');

const solver = new TwoCaptcha.Solver("you api");       //填入验证码平台api私钥

const PRIVATE_KEYS = JSON.parse(fs.readFileSync('./config/privateKeys.json', 'utf-8'));

const delay = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function get_keypair(privateKey) {
    const decodedPrivateKey = base58.decode(privateKey);
    return solana.Keypair.fromSecretKey(decodedPrivateKey);
}

async function faucet_claim(address, beraer_token) {
    try {
        const userAgent = faker.internet.userAgent();
        const proxyUrl = 'socks5://127.0.0.1:7890';     //设置代理
        const agent = new SocksProxyAgent(proxyUrl);
        const service = axios.create({
            httpAgent: agent,
            httpsAgent: agent
        });

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://faucet-api.sonic.game/airdrop/${address}/0.5/${beraer_token}`,     //备用水龙头
            // url: `https://faucet-api-grid-1.sonic.game/airdrop/${address}/0.5/${beraer_token}`,
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
                "Origin": "https://faucet.sonic.game",
                "Priority": "u=1, i",
                "Referer": "https://faucet.sonic.game/",
                "User-Agent": userAgent,
                "sec-ch-ua-mobile": "?0",
            }
        };
        const faucet_result = await service.request(config);
        if (faucet_result.data.status === 'ok') {
            logger.success(`Successfully claim faucet 0.5 SOL!`);
        }
    } catch (error) {
        if (error.response) {
            throw new Error(`${address} 领水请求返回失败: ${response.data.message}`);
        } else {
            throw new Error(`${address} 领水请求出现错误: ${error.message}`);
        }
    }
}


async function bypass_turnstile(address, retry_count = 0) {
    const retry = async (reason) => {
        if (retry_count < 5) {
            logger.warn(`地址 ${address} 尝试领水失败 : ${reason}, 正在重试...(${retry_count + 1}/5)`);
            await delay(2);
            return await bypass_turnstile(address, retry_count + 1);
        } else {
            logger.error(`地址 ${address} 领水失败，已达到最大重试次数`);
        }
    };
    try{
        const res = await solver.cloudflareTurnstile({
            pageurl: "https://faucet.sonic.game/#/",
            sitekey: "0x4AAAAAAAc6HG1RMG_8EHSC"    
        })
        await faucet_claim(address, res.data);
    } catch(error) {
        await retry(error);
    }
}


(async () => {
    try {
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
            const privateKey = PRIVATE_KEYS[i];
            const publicKey = get_keypair(privateKey).publicKey.toBase58();
            logger.debug(`正在处理第 ${i + 1}/${PRIVATE_KEYS.length} 个私钥: ${publicKey} 开始领水`);
            
            await bypass_turnstile(publicKey);
            await delay(3);
        }
    } catch (error) {
        logger.error(`Error in faucet function: ${error.message}`);
    }
})();