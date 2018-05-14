/*
 * SMS receiver for LTE modem model: MF823D
 *
 */
 
require('dotenv').config();

const moment = require('moment');

var stdio = require('stdio');
var requestp = require('request-promise');
var teleBotInstance = require('telebot');


// telegram instance
var telebotOptions = {
	token: process.env.MY_TOKEN,
	usePlugins: [],
	polling: {
		interval: ((60*60)*1000),
		timeout: 0,
		limit: 100,
		retryTimeout: 5000
	}
};

if (process.env.PROXY_ADDR)
	telebotOptions.polling.proxy = process.env.PROXY_ADDR;

var telebot = new teleBotInstance(telebotOptions);

// cli params
var getopt = stdio.getopt({
	method: {
		key: 'm',
		args: 1,
		description: 'method' +
		'-m sms'
	}
});

function modemController(param, resolve) {
	requestp(param).then(resolve).catch(function(error) {
		console.log(error);
	});
}

var paramRequests = {
	getSMSList: {
		url: process.env.MODEM_ADDR + '/goform/goform_get_cmd_process',
		json: true,
		method: 'GET',
		headers: {
			'Referer': process.env.MODEM_ADDR + '/index.html'
		},
		qs: {
			'isTest': false,
			'cmd': 'sms_data_total',
			'page': 0,
			'data_per_page': 500,
			'mem_store': 1,
			'tags': 10,
			'order_by': 'order+by+id+desc'
		}
	},
	getModemInfo: {
		url: process.env.MODEM_ADDR + '/goform/goform_get_cmd_process',
		json: true,
		method: 'GET',
		headers: {
			'Referer': process.env.MODEM_ADDR + '/index.html'
		},
		qs: {
			'isTest': false,
			'cmd': 'wifi_coverage%2Cm_ssid_enable%2Cimei%2Cweb_version%2Cwa_inner_version%2Chardware_version%2CMAX_Access_num%2CSSID1%2Cm_SSID%2Cm_HideSSID%2Cm_MAX_Access_num%2Clan_ipaddr%2Cmac_address%2Cmsisdn%2CLocalDomain%2Cwan_ipaddr%2Cipv6_wan_ipaddr%2Cipv6_pdp_type%2Cpdp_type%2Cppp_status%2Csim_imsi%2Crssi%2Crscp%2Clte_rsrp%2Cnetwork_type',
			'multi_data': 1
		}
	},
	setReadSMSMessage: {
		url: process.env.MODEM_ADDR + '/goform/goform_set_cmd_process',
		json: true,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'Referer': process.env.MODEM_ADDR + '/index.html'
		},
		form: {
			'isTest': false,
			'goformId': 'SET_MSG_READ',
			'tag': 0
		}
		
	},
	setTelegramNotice: function(o) {
		return '[' + o.sms.date + '] ' +
		'*Новое SMS(' + o.sms.id + ') сообщение' + '*' + "\n" +
		'Модель модема: *' + o.modem.hardware + '*' + "\n" +
		'Номер модема: *' + o.modem.phone + '*' + "\n" +
		'Отправитель: *' + o.sms.subject + '*' + "\n" +
		'Сообщение:' + "\n" +
		'```' + o.sms.text + '```';;
	},
	printHelp: "\n" +
		'/mf823 version' + "\n" +
		'/mf823 status' + "\n" +
		'/mf823 help' + "\n"
}

function smsModemController(ctn) {
	var ctn = {};
	ctn.modem = {};
	
	modemController(paramRequests.getModemInfo, function(modem) {

		ctn.modem.hardware = modem.hardware_version;
		ctn.modem.phone = modem.msisdn;

		return modemController(paramRequests.getSMSList, function(sms) {
			if (sms.messages.length > 0) {
				for (var i = 0; i < sms.messages.length; i++) {
					if (sms.messages[i].tag == 1) {
						ctn.sms = {};
						ctn.sms.id = sms.messages[i].id;
						ctn.sms.text = decodeMessage(sms.messages[i].content);
						ctn.sms.date = transTime(sms.messages[i].date);
						ctn.sms.subject = sms.messages[i].number;
						var constructTelegramNotice = paramRequests.setTelegramNotice(ctn);
						paramRequests.setReadSMSMessage.form.msg_id = sms.messages[i].id + ';';
						modemController(paramRequests.setReadSMSMessage, function(res) {
							console.log(res);
						});

						console.log('New message sent');

						telebot.sendMessage(process.env.CHAT_ID, constructTelegramNotice, {
							parseMode: 'Markdown'
						});
					}
				}
			}
		});
	});
}

sendTelegramMessage = function(param) {

	var momentjs = moment();
	var timestamp = momentjs.format('YYYY-MM-DD HH:mm:ss');

	var sentParam = {
		parseMode: 'Markdown'
	};

	if (param.replyToMessage) {
		sentParam.replyToMessage = param.replyToMessage;
	}

	param.message = '`[' + timestamp + ']` ' + "\n" + param.message;

	// console.log(message);
	return telebot.sendMessage(param.chatID, param.message, sentParam);

};

function printTelebotHelp(msg) {
	return sendTelegramMessage({
		message: "\n" +
		'/mf823 version' + "\n" +
		'/mf823 status' + "\n" +
		'/mf823 help' + "\n",
		chatID: msg.chat.id,
		replyToMessage: msg.message_id
	});
}

telebot.on(['/mf823'], function(msg) {
	
	let metsplit = msg.text.split(' ');
	let method = (typeof metsplit[1] !== 'undefined') ? metsplit[1] : '';

	switch(method) {
		case 'status': modemController(paramRequests.getModemInfo, function(modem) {
			return sendTelegramMessage({
				message: '``` ' +
					'imei: ' + modem.imei + "\n" +
					'web_version: ' + modem.web_version + "\n" +
					'wa_inner_version: ' + modem.wa_inner_version + "\n" +
					'hardware_version: ' + modem.hardware_version + "\n" +
					'lan_ipaddr: ' + modem.lan_ipaddr + "\n" +
					'msisdn: ' + modem.msisdn + "\n" +
					'LocalDomain: ' + modem.LocalDomain + "\n" +
					'wan_ipaddr: ' + modem.wan_ipaddr + "\n" +
					'ipv6_wan_ipaddr: ' + modem.ipv6_wan_ipaddr + "\n" +
					'ppp_status: ' + modem.ppp_status + "\n" +
					'sim_imsi: ' + modem.sim_imsi + "\n" +
					'lte_rsrp: ' + modem.lte_rsrp + "\n" +
					'network_type: ' + modem.network_type + "\n" +
					'```',
				chatID: msg.chat.id,
				replyToMessage: msg.message_id
			});
			//console.log(modem);
		});
		break;
		default: sendTelegramMessage({
				message: paramRequests.printHelp,
				chatID: msg.chat.id,
				replyToMessage: msg.message_id
			});
		break;
	}
});


function smsModemControllerServer() {
	var interval = 60000;
	// loop tick infinite
	telebot.start();
	setInterval(function() {
		smsModemController();
	}, interval);
}

switch(getopt.method) {
	case 'server':		smsModemControllerServer();break;
	case 'sms':		smsModemController();break;
	default:		getopt.printHelp();
}

/**
 * (modem source)
 * unicode解码
 * @method decodeMessage
 * @param str
 * @param ignoreWrap {Boolean} 忽略回车换行
 * @return any 
 */
function decodeMessage(str, ignoreWrap) {
	if (!str) return "";
	return str.replace(/([A-Fa-f0-9]{1,4})/g, function (matchstr, parens) {
		return hex2char(parens);
	});
}

/**
 * (modem source)
 */
function hex2char(hex) {
	var result = '';
	var n = parseInt(hex, 16);
	if (n <= 0xFFFF) {
		result += String.fromCharCode(n);
	} else if (n <= 0x10FFFF) {
		n -= 0x10000;
		result += String.fromCharCode(0xD800 | (n >> 10)) + String.fromCharCode(0xDC00 | (n & 0x3FF));
	}
	return result;
}

/**
 * (modem source)
 * 长度不足时，左侧插入特定字符
 * @param {String} value
 * @param {Integer} length
 * @param {String} placeholder
 * @return {String}
 */
function leftInsert(value, length, placeholder){
    var len = value.toString().length;
    for (; len < length; len++) {
        value = placeholder + value;
    }
    return value;
}

/**
 * (modem source)
 * 长度不足时，左侧插入特定字符
 * @param {String} value
 * @param {Integer} length
 * @param {String} placeholder
 * @return {String}
 */
function transTime(data){
    var dateArr = data.split(",");
    if (dateArr.length == 0 || ("," + data + ",").indexOf(",,") != -1) {
        return "";
    } else {
        var time = leftInsert(dateArr[2], 2, '0') + "." + leftInsert(dateArr[1], 2, '0') + "." + dateArr[0] + " " + leftInsert(dateArr[3], 2, '0') + ":" + leftInsert(dateArr[4], 2, '0') + ":"
            + leftInsert(dateArr[5], 2, '0');
        return time;
    }

}
