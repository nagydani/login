import {
    ACTION_APP_INFO,
    ACTION_LOCAL_AUTH,
    ACTION_LOGOUT,
    ACTION_SELF_APP_INFO,
    ACTION_SIGNIN,
    ACTION_SIGNUP,
    getStatus,
    STATUS_COMPLETE,
    STATUS_FAIL,
    STATUS_INIT,
    STATUS_LOG,
    STATUS_MINED,
    STATUS_START,
    STATUS_SUCCESS
} from "./mainReducer";
import Signup, {SIGN_UP_INVITE} from "../Lib/get-login/signup";
import Signin, {LOGIN_DATA, LOGIN_USERNAME_PASSWORD} from "../Lib/get-login/signin";
import {CODE_EMPTY_METHOD_PARAM, LoginError} from "../Lib/get-login/login-error";
import {translate} from "../Lib/get-login/log-translation";
import {validateUserData} from "../Lib/get-login/utils";
import crypto from "../Lib/get-login/crypto";
import contract, {defaultAddresses} from "../Lib/get-login/contract";

const currentNetwork = 'rinkeby';
const smartContractAddress = defaultAddresses[currentNetwork];
let cryptoInstance = crypto.getInstance();
let contractInstance = new contract(cryptoInstance.web3, currentNetwork, smartContractAddress);
let dispatch = null;
let signup = null;
let signin = null;

export const doDispatch = (type, data = {}) => {
    dispatch({type, data});
};

export const init = (dispatch) => {
    const getLogger = (action) => {
        return {
            log: (type, data) => {
                console.log(type, data);
                const message = translate(type);
                console.log(message);
                doDispatch(getStatus(action, STATUS_LOG), message);
            }
        };
    };
    setDispatch(dispatch);
    signup = new Signup(cryptoInstance, contractInstance);
    signin = new Signin(cryptoInstance, contractInstance);
    signup.setLogger(getLogger(ACTION_SIGNUP));
    signin.setLogger(getLogger(ACTION_SIGNIN));
    checkLocalCredentials().then();
    doDispatch(getStatus(ACTION_SELF_APP_INFO, STATUS_INIT), {
        network: currentNetwork,
        smartContractAddress,
        provider: cryptoInstance.config.websocketProviderUrl
    });
};


export const checkLocalCredentials = async () => {
    return callMethod(ACTION_LOCAL_AUTH, async () => {
        const data = getUserData();
        await validateUserData(data);

        return {username: data.username, wallet: data.wallet};
    });
};

export const setDispatch = (newDispatch) => {
    dispatch = newDispatch;
};

export const getDispatch = () => {
    return dispatch;
};

export const signIn = async (method, username, password, wallet) => {
    // todo prepare username for reducer
    return callMethod(ACTION_SIGNIN, async () => {
        await signin.signIn(method, username, password, wallet);
        if (method === LOGIN_DATA) {
            setUserData(username, wallet);
        } else if (method === LOGIN_USERNAME_PASSWORD) {
            setUserData(username);
        } else {
            throw new Error('Not supported method for local storing');
        }

        return {username};
    });
};

export const signUp = async (method, username, password = '', invite = '') => {
    /** @type {IInviteRegistration} */
    const result = await callMethod(ACTION_SIGNUP, async () => {
        return await signup.signUp(method, username, password, invite, info => {
            doDispatch(getStatus(ACTION_SIGNUP, STATUS_MINED), info);
        });
    });

    if (result && [SIGN_UP_INVITE/*, LOGIN_WEB3, LOGIN_TREZOR*/].includes(method)) {
        if (method === SIGN_UP_INVITE) {
            method = LOGIN_DATA;
        }

        setUserData(username, result.newWallet);
        await checkLocalCredentials();
    }

    return result;
};

export const logoutLocal = () => {
    return callMethod(ACTION_LOGOUT, async () => {
        return setUserData(null, null);
    });
};

export const setUserData = (username, wallet = null) => {
    if (username) {
        localStorage.setItem('username', username);
    } else {
        localStorage.removeItem('username');
    }

    if (wallet) {
        if (typeof wallet === 'object') {
            wallet = JSON.stringify(wallet);
        }

        localStorage.setItem('wallet', wallet);
    } else {
        localStorage.removeItem('wallet');
    }

    return true;
};

export const getUserData = () => {
    const username = localStorage.getItem('username');
    const wallet = JSON.parse(localStorage.getItem('wallet'));

    return {username, wallet};
};

export const initPage = (pageAction) => {
    doDispatch(getStatus(pageAction, STATUS_INIT));
};

export const getAppInfo = async (appId) => {
    return callMethod(ACTION_APP_INFO, async () => await contractInstance.getAppInfo(appId), appId);
};

export const callMethod = async (actionName, func, startData = null) => {
    let result = null;
    try {
        doDispatch(getStatus(actionName, STATUS_START), startData);
        if (!func) {
            throw new LoginError(CODE_EMPTY_METHOD_PARAM);
        }

        result = await func();
        doDispatch(getStatus(actionName, STATUS_SUCCESS), result);
    } catch (error) {
        // todo not log error, but pass correct filenames to dispatch
        console.log(error);
        doDispatch(getStatus(actionName, STATUS_FAIL), error);
    }

    doDispatch(getStatus(actionName, STATUS_COMPLETE));

    return result;
};
