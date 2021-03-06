import { CANCELLED_STATUS } from 'discourse/lib/autocomplete';
import { userPath } from 'discourse/lib/url';

var cache = {},
    cacheTopicId,
    cacheTime,
    currentTerm,
    oldSearch;

function performSearch(term, topicId, includeGroups, includeMentionableGroups, allowedUsers, group, resultsFn) {
  var cached = cache[term];
  if (cached) {
    resultsFn(cached);
    return;
  }

  // need to be able to cancel this
  oldSearch = $.ajax(userPath('search/users'), {
    data: { term: term,
            topic_id: topicId,
            include_groups: includeGroups,
            include_mentionable_groups: includeMentionableGroups,
            group: group,
            topic_allowed_users: allowedUsers }
  });

  var returnVal = CANCELLED_STATUS;

  oldSearch.then(function (r) {
    cache[term] = r;
    cacheTime = new Date();
    // If there is a newer search term, return null
    if (term === currentTerm) { returnVal = r; }

  }).always(function(){
    oldSearch = null;
    resultsFn(returnVal);
  });
}

var debouncedSearch = _.debounce(performSearch, 300);

function organizeResults(r, options) {
  if (r === CANCELLED_STATUS) { return r; }

  var exclude = options.exclude || [],
      limit = options.limit || 5,
      users = [],
      groups = [],
      results = [];

  if (r.users) {
    r.users.every(function(u) {
      if (exclude.indexOf(u.username) === -1) {
        users.push(u);
        results.push(u);
      }
      return results.length <= limit;
    });
  }

  if (r.groups) {
    r.groups.every(function(g) {
      if (results.length > limit && options.term !== g.name) return false;
      if (exclude.indexOf(g.name) === -1) {
        groups.push(g);
        results.push(g);
      }
      return true;
    });
  }

  results.users = users;
  results.groups = groups;
  return results;
}


export default function userSearch(options) {
  var term = options.term || "",
      includeGroups = options.includeGroups,
      includeMentionableGroups = options.includeMentionableGroups,
      allowedUsers = options.allowedUsers,
      topicId = options.topicId,
      group = options.group;


  if (oldSearch) {
    oldSearch.abort();
    oldSearch = null;
  }

  currentTerm = term;

  return new Ember.RSVP.Promise(function(resolve) {
    // TODO site setting for allowed regex in username
    if (term.match(/[^\w\.\-]/)) {
      resolve([]);
      return;
    }
    if (((new Date() - cacheTime) > 30000) || (cacheTopicId !== topicId)) {
      cache = {};
    }

    cacheTopicId = topicId;

    var clearPromise = setTimeout(function(){
      resolve(CANCELLED_STATUS);
    }, 5000);

    debouncedSearch(term,
        topicId,
        includeGroups,
        includeMentionableGroups,
        allowedUsers,
        group,
        function(r) {
          clearTimeout(clearPromise);
          resolve(organizeResults(r, options));
        });

  });
}
