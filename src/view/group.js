/*global view, VIS, d3 */
"use strict";

// Topic groups: the group page, plus helpers used by the other views to
// show group colors, names, and links. Group objects come from dfb's
// topic_groups(): { id, order, name, color, topics, other }.

view.group = function (p) {
    var div = d3.select("div#group_view");

    div.select("#group_view_help").classed("hidden", true);
    div.select("#group_view_main").classed("hidden", false);

    div.select("#group_header").text(p.group.name);
    div.select("#group_swatch").call(view.group.swatch, p.group);

    div.select("#group_subheader").text(function () {
        var n = p.group.topics.length,
            result = n + (n === 1 ? " topic" : " topics");
        if (p.n_hidden > 0) {
            result += " (" + p.n_hidden + " hidden)";
        }
        if (p.group.other) {
            result += " not assigned to any group";
        }
        return result;
    });

    d3.select("div#group_plot").call(view.group.color, p.group);
};

// show the help text in place of a group page
view.group.help = function (p) {
    var div = d3.select("div#group_view");
    div.select("#group_view_help").classed("hidden", false);
    div.select("#group_view_main").classed("hidden", true);
    div.select("#group_help_select").classed("hidden", !p.has_groups);
    div.select("#group_help_none").classed("hidden", p.has_groups);
};

// the member-topics table
view.group.topics = function (p) {
    var trs, trs_enter,
        topics = p.topics.slice().sort(function (a, b) {
            return d3.descending(a.sum, b.sum) || d3.ascending(a.t, b.t);
        }),
        max_sum = d3.max(topics, function (t) { return t.sum; });

    d3.select("#group_topics .none")
        .classed("hidden", topics.length > 0);
    d3.select("#group_topics table")
        .classed("hidden", topics.length === 0);

    trs = d3.select("#group_topics tbody")
        .selectAll("tr")
        .data(topics, function (t) { return t.id; });

    trs_enter = trs.enter().append("tr");
    trs.exit().remove();

    trs.on("click", function (t) {
        view.dfb().set_view({ type: "topic", param: t.id });
    });

    trs_enter.append("td").append("a").classed("topic_name", true);
    trs.select("a.topic_name")
        .attr("href", function (t) {
            return view.dfb().view_link({ type: "topic", param: t.id });
        })
        .text(function (t) { return t.label; });

    trs_enter.append("td").append("a").classed("topic_words", true);
    trs.select("a.topic_words")
        .attr("href", function (t) {
            return view.dfb().view_link({ type: "topic", param: t.id });
        })
        .text(function (t) {
            return t.words.map(function (w) { return w.word; }).join(" ");
        });

    view.weight_tds({
        sel: trs,
        enter: trs_enter,
        w: function (t) { return max_sum ? t.sum / max_sum : 0; },
        frac: function (t) {
            return d3.format(VIS.percent_format)(t.sum / p.total);
        }
    });

    trs.sort(function (a, b) {
        return d3.descending(a.sum, b.sum) || d3.ascending(a.t, b.t);
    });

    d3.select("#group_share").text(
        d3.format(VIS.percent_format)(d3.sum(topics, function (t) {
            return t.sum;
        }) / p.total)
    );
};

// the combined conditional barplot
view.group.conditional = function (p) {
    var empty = p.data.size() === 0;

    d3.select("#group_conditional .none").classed("hidden", !empty);
    d3.select("div#group_plot").classed("hidden", empty);
    if (empty) {
        return;
    }

    p.container = "#group_conditional";
    p.plot = "div#group_plot";
    p.view_type = "group";
    view.topic.conditional(p);
};

// Navbar menu of groups; the menu is hidden if there are no groups
view.group.dropdown = function (p) {
    var lis;

    d3.select("li#nav_group").classed("hidden", p.groups.length === 0);

    lis = d3.select("ul#group_dropdown")
        .selectAll("li")
        .data(p.groups, function (g) { return g.id + "\u0000" + g.name; });

    lis.enter().append("li").append("a")
        .call(function (a) {
            a.append("span").classed("group_swatch", true);
            a.append("span").classed("group_name", true);
        });
    lis.exit().remove();

    lis.select("a")
        .attr("href", view.group.link);
    lis.select("span.group_swatch").call(view.group.swatch);
    lis.select("span.group_name")
        .text(function (g) {
            return " " + g.name + " (" + g.topics.length + ")";
        });
    lis.order();
};

// Legend for the overview plots: one link per group. Groups that are
// filtered out are shown muted.
view.group.legend = function (p) {
    var div = d3.select("#group_legend"),
        items;

    div.classed("hidden", p.groups.length === 0);

    items = div.selectAll("a.group_legend_item")
        .data(p.groups, function (g) { return g.id + "\u0000" + g.name; });

    items.enter().append("a")
        .classed("group_legend_item", true)
        .call(function (a) {
            a.append("span").classed("group_swatch", true);
            a.append("span").classed("group_name", true);
        });
    items.exit().remove();

    items.attr("href", view.group.link)
        .classed("filtered_group", function (g) {
            return p.hidden_groups.indexOf(g.name) !== -1;
        })
        .attr("title", function (g) {
            return p.hidden_groups.indexOf(g.name) !== -1 ?
                "hidden (change in Settings)" : "";
        });
    items.select("span.group_swatch").call(view.group.swatch);
    items.select("span.group_name").text(function (g) { return g.name; });
    items.order();
};

// Helpers
// -------

// URL of a group's page
view.group.link = function (g) {
    return view.dfb().view_link({ type: "group", param: g.id });
};

// Color a selection of swatch spans with the bound group (or g, if given)
view.group.swatch = function (sel, g) {
    sel.classed("group_swatch", true)
        .style("background-color", function (d) {
            var grp = g || d;
            return grp ? grp.color : null;
        })
        .classed("hidden", function (d) { return !(g || d); });
};

// Mark a container whose plot marks should take the color of group g. The
// CSS rules for the grouped class read the --group-color property, so
// hover and selection styles keep working. Pass an undefined group to clear.
view.group.color = function (sel, g) {
    sel.classed("grouped", !!g)
        .style("--group-color", g ? g.color : null);
};
