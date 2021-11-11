// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ChannelTypes, PostTypes, TeamTypes, ThreadTypes, UserTypes} from 'mattermost-redux/action_types';
import {GenericAction} from 'mattermost-redux/types/actions';
import {Team} from 'mattermost-redux/types/teams';
import {ThreadsState, UserThread} from 'mattermost-redux/types/threads';

import {ExtraData} from './types';

type State = ThreadsState['threadsInTeam'] | ThreadsState['unreadThreadsInTeam'];

function handlePostRemoved(state: State, action: GenericAction) {
    const post = action.data;
    if (post.root_id) {
        return state;
    }

    const teamId = Object.keys(state).
        find((id) => state[id].indexOf(post.id) !== -1);

    if (!teamId) {
        return state;
    }

    const index = state[teamId].indexOf(post.id);

    return {
        ...state,
        [teamId]: [
            ...state[teamId].slice(0, index),
            ...state[teamId].slice(index + 1),
        ],
    };
}

// add the thread only if it's 'newer' than other threads
// older threads will be added by scrolling so no need to manually add.
// furthermore manually adding older thread will BREAK pagination
export function handleFollowChanged(state: State, action: GenericAction, extra: ExtraData) {
    const {id, team_id: teamId, following} = action.data;
    const nextSet = new Set(state[teamId] || []);

    if (!extra.threads) {
        return state;
    }

    const thread = extra.threads[id];

    if (!thread) {
        return state;
    }

    // thread exists in state
    if (nextSet.has(id)) {
        // remove it if we unfollowed
        if (!following) {
            nextSet.delete(id);
            return {
                ...state,
                [teamId]: [...nextSet],
            };
        }
        return state;
    }

    // check if thread is newer than any of the existing threads
    const shouldAdd = [...nextSet].some((id) => {
        const t = extra.threads![id];
        return t.last_reply_at > thread.last_reply_at;
    });

    if (shouldAdd) {
        nextSet.add(thread.id);

        return {
            ...state,
            [teamId]: [...nextSet],
        };
    }

    return state;
}

function handleReceiveThreads(state: State, action: GenericAction) {
    const nextSet = new Set(state[action.data.team_id] || []);

    action.data.threads.forEach((thread: UserThread) => {
        nextSet.add(thread.id);
    });

    return {
        ...state,
        [action.data.team_id]: [...nextSet],
    };
}

function handleLeaveChannel(state: State, action: GenericAction, extra: ExtraData) {
    if (!extra.threadsToDelete || extra.threadsToDelete.length === 0) {
        return state;
    }

    const teamId = action.data.team_id;

    let threadDeleted = false;

    // Remove entries for any thread in the channel
    const nextState = {...state};
    for (const thread of extra.threadsToDelete) {
        if (nextState[teamId]) {
            const index = nextState[teamId].indexOf(thread.id);
            nextState[teamId] = [...nextState[teamId].slice(0, index), ...nextState[teamId].slice(index + 1)];
            threadDeleted = true;
        }
    }

    if (!threadDeleted) {
        // Nothing was actually removed
        return state;
    }

    return nextState;
}

function handleLeaveTeam(state: State, action: GenericAction) {
    const team: Team = action.data;

    if (!state[team.id]) {
        return state;
    }

    const nextState = {...state};
    Reflect.deleteProperty(nextState, team.id);

    return nextState;
}
export const threadsInTeamReducer = (state: ThreadsState['threadsInTeam'] = {}, action: GenericAction, extra: ExtraData) => {
    switch (action.type) {
    case PostTypes.POST_REMOVED:
        return handlePostRemoved(state, action);
    case ThreadTypes.RECEIVED_THREADS:
        return handleReceiveThreads(state, action);
    case TeamTypes.LEAVE_TEAM:
        return handleLeaveTeam(state, action);
    case UserTypes.LOGOUT_SUCCESS:
        return {};
    case ChannelTypes.LEAVE_CHANNEL:
        return handleLeaveChannel(state, action, extra);
    }

    return state;
};

export const unreadThreadsInTeamReducer = (state: ThreadsState['unreadThreadsInTeam'] = {}, action: GenericAction, extra: ExtraData) => {
    switch (action.type) {
    case ThreadTypes.READ_CHANGED_THREAD: {
        const {
            id,
            teamId,
            newUnreadMentions,
            newUnreadReplies,
        } = action.data;
        const team = state[teamId] || [];

        // do nothing when thread is not in the list
        // or the thread is unread
        const index = team.indexOf(id);
        if (index === -1 || newUnreadReplies || newUnreadMentions) {
            return state;
        }

        // if the thread is read remove it
        return {
            ...state,
            [teamId]: [
                ...team.slice(0, index),
                ...team.slice(index + 1),
            ],
        };
    }
    case PostTypes.POST_REMOVED:
        return handlePostRemoved(state, action);
    case ThreadTypes.RECEIVED_UNREAD_THREADS:
        return handleReceiveThreads(state, action);
    case TeamTypes.LEAVE_TEAM:
        return handleLeaveTeam(state, action);
    case UserTypes.LOGOUT_SUCCESS:
        return {};
    case ChannelTypes.LEAVE_CHANNEL:
        return handleLeaveChannel(state, action, extra);
    case ThreadTypes.FOLLOW_CHANGED_THREAD:
        return handleFollowChanged(state, action, extra);
    }
    return state;
};
