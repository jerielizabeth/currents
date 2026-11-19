/*global view, VIS, utils, d3, document */
"use strict";

// Compare ad hoc topic groups. The groups exist only in the URL
// (#/compare/name:id,id/name:id,id), so every change to them goes through
// set_view and comes back here as a fresh render. Only the choice of which
// group is being edited, the picker filter, and the "selected only" toggle
// are kept here, as page state.
//
// Groups passed in by dfb are { name, ids, topics, color, n_hidden }, where
// ids are topic ids as strings (as in the URL) and topics are 0-based.

view.compare = function (p) {
    var state = view.compare.state,
        div = d3.select("div#compare_view");

    view.compare.last = p;

    if (state.editing === undefined || state.editing >= p.groups.length) {
        state.editing = p.groups.length - 1;
    }

    view.compare.group_table(p);

    div.select("#compare_groups p.none")
        .classed("hidden", p.groups.length > 0);
    div.select("#compare_groups table")
        .classed("hidden", p.groups.length === 0);

    view.compare.defined_menu(p);
    view.compare.picker(p);
};

view.compare.state = {
    editing: undefined,
    filter: "",
    selected_only: false
};

// URL segment for one group
view.compare.param = function (g) {
    return encodeURIComponent(g.name) + ":" + g.ids.join(",");
};

// change the groups by changing the URL
view.compare.go = function (groups) {
    view.dfb().set_view({
        type: "compare",
        param: groups.map(view.compare.param)
    });
};

// copy the current groups as plain { name, ids } objects for editing
view.compare.specs = function () {
    return view.compare.last.groups.map(function (g) {
        return { name: g.name, ids: g.ids.slice() };
    });
};

// a default name not already taken
view.compare.new_name = function (groups) {
    var j = groups.length + 1,
        taken = function (name) {
            return groups.some(function (g) { return g.name === name; });
        };
    while (taken("Group " + j)) {
        j += 1;
    }
    return "Group " + j;
};

// the table of groups, which doubles as the plot legend
view.compare.group_table = function (p) {
    var trs, trs_enter, actions;

    trs = d3.select("#compare_groups tbody")
        .selectAll("tr")
        .data(p.groups);

    trs_enter = trs.enter().append("tr");
    trs.exit().remove();

    trs_enter.append("td").classed("compare_name", true)
        .call(function (td) {
            td.append("span").classed("group_swatch", true);
            td.append("input")
                .attr("type", "text")
                .attr("aria-label", "group name")
                .classed("compare_name", true);
        });
    trs_enter.append("td").classed("td-right compare_count", true);
    trs_enter.append("td").classed("td-right compare_share", true);
    actions = trs_enter.append("td").classed("td-right compare_actions", true);
    actions.append("button")
        .attr("type", "button")
        .classed("btn btn-default btn-xs compare_edit", true);
    actions.append("button")
        .attr("type", "button")
        .classed("btn btn-link btn-xs compare_remove", true)
        .text("remove");

    trs.classed("editing", function (g, j) {
        return j === view.compare.state.editing;
    });

    trs.select("span.group_swatch").call(view.group.swatch);

    trs.select("input.compare_name")
        .each(function (g) {
            // don't clobber a name being typed
            if (document.activeElement !== this) {
                this.value = g.name;
            }
        })
        .on("change", function (g, j) {
            var specs = view.compare.specs();
            specs[j].name = this.value.trim() || g.name;
            view.compare.go(specs);
        })
        .on("keydown", function () {
            if (d3.event.keyCode === 13) { // enter
                this.blur();
            }
        });

    trs.select("td.compare_count")
        .text(function (g) {
            var s = g.topics.length + (g.topics.length === 1 ? " topic"
                : " topics");
            if (g.n_hidden > 0) {
                s += " (" + g.n_hidden + " hidden)";
            }
            return s;
        });

    trs.select("td.compare_share").text("");

    trs.select("button.compare_edit")
        .text(function (g, j) {
            return j === view.compare.state.editing ? "editing"
                : "edit topics";
        })
        .classed("active", function (g, j) {
            return j === view.compare.state.editing;
        })
        .on("click", function (g, j) {
            view.compare.state.editing = j;
            view.compare(view.compare.last);
        });

    trs.select("button.compare_remove")
        .on("click", function (g, j) {
            var specs = view.compare.specs();
            specs.splice(j, 1);
            if (view.compare.state.editing >= j) {
                view.compare.state.editing = Math.max(0,
                    view.compare.state.editing - 1);
            }
            view.compare.go(specs);
        });

    d3.select("#compare_new")
        .on("click", function () {
            var specs = view.compare.specs();
            specs.push({ name: view.compare.new_name(specs), ids: [ ] });
            view.compare.state.editing = specs.length - 1;
            view.compare.go(specs);
        });
};

// fill in each group's share of the corpus once it is calculated
view.compare.shares = function (p) {
    d3.selectAll("#compare_groups tbody tr td.compare_share")
        .text(function (g, j) {
            return d3.format(VIS.percent_format)(p.shares[j]);
        });
};

// menu for starting a group from one of the model's own groups
view.compare.defined_menu = function (p) {
    var sel = d3.select("select#compare_add_defined"),
        opts;

    sel.classed("hidden", p.defined.length === 0);

    opts = sel.selectAll("option")
        .data([undefined].concat(p.defined));
    opts.enter().append("option");
    opts.exit().remove();
    opts.attr("value", function (g, j) { return j; })
        .text(function (g) {
            return g ? g.name + " (" + g.ids.length + ")"
                : "Copy one of the model's groups...";
        });
    sel.property("value", "0");

    sel.on("change", function () {
        var j = +this.value,
            specs;
        if (j > 0) {
            specs = view.compare.specs();
            specs.push({
                name: p.defined[j - 1].name,
                ids: p.defined[j - 1].ids.slice()
            });
            view.compare.state.editing = specs.length - 1;
            view.compare.go(specs);
        }
    });
};

// checklist of all topics for the group being edited, in sections by the
// model's own groups if it has any
view.compare.picker = function (p) {
    var state = view.compare.state,
        div = d3.select("#compare_picker"),
        g = p.groups[state.editing],
        chosen, sections, secs, secs_enter, labels, labels_enter,
        visible, toggle;

    div.classed("hidden", !g);
    if (!g) {
        return;
    }

    chosen = d3.set(g.ids);

    div.select("span.group_swatch").call(view.group.swatch, g);
    div.select("#compare_editing_name").text(g.name);

    div.select("input#compare_filter")
        .property("value", state.filter)
        .on("input", function () {
            state.filter = this.value;
            view.compare.picker(view.compare.last);
        });
    div.select("input#compare_selected_only")
        .property("checked", state.selected_only)
        .on("change", function () {
            state.selected_only = this.checked;
            view.compare.picker(view.compare.last);
        });

    visible = function (t) {
        var terms = state.filter.toLowerCase().split(/\s+/)
                .filter(function (s) { return s.length > 0; }),
            text = (t.label + " " + t.words).toLowerCase();
        if (state.selected_only && !chosen.has(t.id)) {
            return false;
        }
        return terms.every(function (s) { return text.indexOf(s) !== -1; });
    };

    if (p.defined.length > 0) {
        sections = p.defined.map(function (dg) {
            return {
                name: dg.name,
                group: dg,
                topics: p.topics.filter(function (t) {
                    return t.group && t.group.id === dg.id;
                })
            };
        });
    } else {
        sections = [{ name: "", topics: p.topics }];
    }
    sections.forEach(function (s) {
        s.topics = s.topics.slice().sort(function (a, b) {
            return d3.ascending(a.label, b.label) || d3.ascending(a.t, b.t);
        });
        s.shown = s.topics.filter(visible);
    });

    // add or remove a list of topic ids from the group being edited
    toggle = function (ids, add) {
        var specs = view.compare.specs(),
            cur = d3.set(specs[state.editing].ids);
        ids.forEach(function (id) {
            if (add) {
                cur.add(id);
            } else {
                cur.remove(id);
            }
        });
        // keep topics in the order of the model
        specs[state.editing].ids = p.topics
            .filter(function (t) { return cur.has(t.id); })
            .map(function (t) { return t.id; });
        view.compare.go(specs);
    };

    secs = div.select("#compare_sections").selectAll("div.compare_section")
        .data(sections, function (s) { return s.name; });
    secs_enter = secs.enter().append("div").classed("compare_section", true);
    secs.exit().remove();
    secs.order();

    secs_enter.append("h4").call(function (h) {
        h.append("span").classed("group_swatch", true);
        h.append("span").classed("compare_section_name", true);
        h.append("a").classed("compare_all", true).text("select all");
        h.append("a").classed("compare_none", true).text("clear");
    });
    secs_enter.append("div").classed("compare_topics", true);

    secs.classed("hidden", function (s) { return s.shown.length === 0; });
    secs.select("h4").classed("hidden", function (s) { return !s.group; });
    secs.select("h4 span.group_swatch").each(function (s) {
        d3.select(this).call(view.group.swatch, s.group);
    });
    secs.select("span.compare_section_name")
        .text(function (s) { return " " + s.name; });
    secs.select("a.compare_all")
        .on("click", function (s) {
            toggle(s.shown.map(function (t) { return t.id; }), true);
        });
    secs.select("a.compare_none")
        .on("click", function (s) {
            toggle(s.shown.map(function (t) { return t.id; }), false);
        });

    labels = secs.select("div.compare_topics").selectAll("label.compare_topic")
        .data(function (s) { return s.topics; }, function (t) { return t.id; });
    labels_enter = labels.enter().append("label")
        .classed("compare_topic", true);
    labels.exit().remove();
    labels.order();

    labels_enter.append("input").attr("type", "checkbox");
    labels_enter.append("span").classed("compare_label", true);
    labels_enter.append("span").classed("compare_words", true);

    labels.classed("hidden", function (t) { return !visible(t); })
        .classed("hidden_topic", function (t) { return t.hidden; })
        .classed("selected", function (t) { return chosen.has(t.id); });
    labels.select("input")
        .property("checked", function (t) { return chosen.has(t.id); })
        .on("change", function (t) {
            toggle([t.id], this.checked);
        });
    labels.select("span.compare_label").text(function (t) { return t.label; });
    labels.select("span.compare_words").text(function (t) { return t.words; });
};

// Line plot of each group's combined share in each condition.
// p.keys: sorted condition keys
// p.key: the condition key object (invert, display)
// p.series: [{ name, color, y }], y aligned with keys
view.compare.plot = function (p) {
    var spec = utils.clone(VIS.topic_view),
        container = d3.select("#compare_conditional"),
        series = p.series.filter(function (s) { return s.n > 0; }),
        empty = series.length === 0 || p.keys.length === 0,
        svg, xs, px, scale_x, scale_y, line, axes, paths, focus, dots,
        overlay, nearest, fmt = d3.format(VIS.percent_format);

    container.select("p.none").classed("hidden", !empty);
    container.select("#compare_plot").classed("hidden", empty);
    if (empty) {
        return;
    }

    spec.w = container.node().clientWidth || spec.w;
    spec.w = Math.max(spec.w, VIS.topic_view.w);
    spec.w -= spec.m.left + spec.m.right;
    spec.h = Math.floor(spec.w / 2.5) - spec.m.top - spec.m.bottom;

    svg = d3.select("#compare_plot").selectAll("svg").data([1]);
    svg.enter().call(view.append_plot);
    svg = view.setup_plot(svg, spec);

    xs = p.keys.map(function (k) { return p.key.invert(k); });

    if (p.type === "time") {
        scale_x = d3.time.scale.utc().domain(d3.extent(xs));
    } else if (p.type === "continuous") {
        scale_x = d3.scale.linear().domain(d3.extent(xs));
    } else {
        scale_x = d3.scale.ordinal().domain(xs);
    }
    if (scale_x.rangePoints) {
        scale_x.rangePoints([0, spec.w], 1);
    } else {
        scale_x.range([0, spec.w]);
    }
    px = xs.map(scale_x);

    scale_y = d3.scale.linear()
        .domain([0, d3.max(series, function (s) { return d3.max(s.y); })])
        .range([spec.h, 0])
        .nice();

    // axes
    axes = svg.selectAll("g.axis").data(["x", "y"]);
    axes.enter().append("g").classed("axis", true)
        .classed("x", function (v) { return v === "x"; })
        .classed("y", function (v) { return v === "y"; });
    axes.attr("transform", function (v) {
        return v === "x" ? "translate(0," + spec.h + ")" : undefined;
    })
        .each(function (v) {
            var sel = d3.select(this),
                ax = d3.svg.axis()
                    .scale(v === "x" ? scale_x : scale_y)
                    .orient(v === "x" ? "bottom" : "left");
            if (v === "x") {
                if (p.type === "time") {
                    if (spec.time.ticks.unit) {
                        ax.ticks(d3.time[spec.time.ticks.unit].utc,
                            spec.time.ticks.n);
                    } else if (typeof spec.time.ticks === "number") {
                        ax.ticks(spec.time.ticks);
                    }
                } else if (p.type === "continuous") {
                    ax.ticks(spec.continuous.ticks);
                }
            } else {
                ax.tickSize(-spec.w)
                    .outerTickSize(0)
                    .tickFormat(fmt)
                    .ticks(spec.ticks_y);
            }
            sel.call(ax);
            if (v === "y") {
                sel.selectAll("g")
                    .filter(function (d) { return d > 0; })
                    .classed("minor", true);
            }
        });

    svg.selectAll("text.axis_label").data([1])
        .enter().append("text").classed("axis_label", true);
    svg.select("text.axis_label")
        .attr("x", spec.w / 2)
        .attr("y", spec.h + spec.m.bottom)
        .attr("text-anchor", "middle")
        .text(p.condition_name);

    // lines
    line = d3.svg.line()
        .x(function (d, j) { return px[j]; })
        .y(function (d) { return scale_y(d); });

    paths = svg.selectAll("path.compare_line")
        .data(series);
    paths.enter().append("path").classed("compare_line", true);
    paths.exit().remove();
    paths.style("stroke", function (s) { return s.color; })
        .attr("d", function (s) { return line(s.y); });

    // hover: a rule at the nearest condition, with each group's value
    focus = svg.selectAll("g.compare_focus").data([1]);
    focus.enter().append("g").classed("compare_focus", true)
        .append("line");
    focus.classed("hidden", true);
    focus.select("line").attr("y1", 0).attr("y2", spec.h);

    dots = focus.selectAll("circle").data(series);
    dots.enter().append("circle").attr("r", 4);
    dots.exit().remove();
    dots.style("fill", function (s) { return s.color; });

    nearest = function (x) {
        var best = 0;
        px.forEach(function (v, j) {
            if (Math.abs(v - x) < Math.abs(px[best] - x)) {
                best = j;
            }
        });
        return best;
    };

    overlay = svg.selectAll("rect.compare_overlay").data([1]);
    overlay.enter().append("rect").classed("compare_overlay", true);
    overlay.attr("width", spec.w)
        .attr("height", spec.h)
        .on("mousemove", function () {
            var j = nearest(d3.mouse(this)[0]),
                tt = view.tooltip(),
                tp = tt.div.select("p"),
                rows;

            focus.classed("hidden", false);
            focus.select("line").attr("x1", px[j]).attr("x2", px[j]);
            dots.attr("cx", px[j])
                .attr("cy", function (s) { return scale_y(s.y[j]); });

            // build the tooltip with DOM methods: group names come from
            // the URL and must not be treated as markup
            tp.text("");
            tp.append("strong").text(p.key.display(p.keys[j]));
            rows = series.slice().sort(function (a, b) {
                return d3.descending(a.y[j], b.y[j]);
            });
            rows.forEach(function (s) {
                tp.append("br");
                tp.append("span").call(view.group.swatch, s);
                tp.append("span").text(" " + s.name + ": " + fmt(s.y[j]));
            });
            tt.update_pos();
            tt.show();
        })
        .on("mouseout", function () {
            focus.classed("hidden", true);
            view.tooltip().hide();
        });
};
