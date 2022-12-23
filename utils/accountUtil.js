const Account = require("../models/Account");

exports.updateAccount = async ({userId, type, price, timeout = false}) => {
    let account = await Account.findOneAndUpdate({userId: userId, lock: false}, {$set: {lock: true}}, {new: true});
    let n = 1;
    while (!account) {
        if (timeout && n >= 30) throw new Error('Account operation busy');
        await new Promise(s => setTimeout(s, 100));
        account = await Account.findOneAndUpdate({userId: userId, lock: false}, {$set: {lock: true}}, {new: true});
        n++;
    }
    let error = "";
    switch (type) {
        case 0:
            account.processing = (BigInt(account.processing) - BigInt(price)).toString();
            break;
        case 1:
            account.amount = (BigInt(account.amount) - BigInt(price)).toString();
            account.processing = (BigInt(account.processing) - BigInt(price)).toString();
            break;
        case 2:
            if (BigInt(account.amount) - BigInt(account.processing) < BigInt(price)) {
                error = "Insufficient balance";
                break;
            }
            account.processing = (BigInt(account.processing) + BigInt(price)).toString();
            break;
        case 3:
            account.amount = (BigInt(account.amount) + BigInt(price)).toString();
            break;
    }
    account.lock = false
    await account.save();
    if (error) throw new Error(error);
    return account;
}
