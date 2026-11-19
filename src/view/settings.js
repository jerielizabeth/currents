/*global view, VIS, d3 */
"use strict";

view.settings = function (p) {
    var stg;

    stg = d3.select("#settings_modal");

    stg.select("#n_words_list input")
        .property("min", 1)
        .property("max", p.max_words)
        .property("value", p.overview_words)
        .on("change", function () {
            view.dfb().update_settings({
                overview_words: this.valueAsNumber
            });
        });
    stg.select("#n_words_topic input")
        .property("min", 1)
        .property("max", p.max_words)
        .property("value", p.topic_view.words)
        .on("change", function () {
            view.dfb().update_settings({
                topic_view: { words: this.valueAsNumber }
            });
        });
    stg.select("#n_topic_docs input")
        .property("min", 1)
        .property("max", p.max_docs)
        .property("value", p.topic_view.docs)
        .on("change", function () {
            view.dfb().update_settings({
                topic_view: { docs: this.valueAsNumber }
            });
        });

    stg.select("#reveal_hidden")
        .classed("hidden", VIS.hidden_topics.length === 0)
        .select("input")
            .property("checked", p.show_hidden_topics === true)
            .on("change", function () {
                view.dfb().update_settings({
                    show_hidden_topics: this.checked
                });
            });

    view.settings.group_filter(stg, p);

    stg.select("#conditional_streamgraph")
        .classed("hidden", p.condition_type === "ordinal")
        .select("input")
            .property("checked", !!p.model_view.conditional.streamgraph)
            .on("change", function () {
                view.dfb().update_settings({
                    model_view: { conditional: {
                        streamgraph: this.checked
                    } }
                });
            });
};

// checkboxes for showing or hiding topic groups; the setting stored is the
// list of names of hidden groups
view.settings.group_filter = function (stg, p) {
    var groups = p.groups || [ ],
        div = stg.select("#group_filter"),
        items, items_enter, update;

    div.classed("hidden", groups.length === 0);

    items = div.select(".group_filter_items").selectAll("div")
        .data(groups, function (g) { return g.name; });

    items_enter = items.enter().append("div");
    items_enter.append("input").attr("type", "checkbox");
    items_enter.append("span").classed("group_swatch", true);
    items_enter.append("label");
    items.exit().remove();
    items.order();

    update = function () {
        var hidden = [ ];
        items.select("input").each(function (g) {
            if (!this.checked) {
                hidden.push(g.name);
            }
        });
        view.dfb().update_settings({ hidden_groups: hidden });
    };

    items.select("input")
        .property("checked", function (g) {
            return p.hidden_groups.indexOf(g.name) === -1;
        })
        .on("change", update);
    items.select("span.group_swatch").call(view.group.swatch);
    items.select("label").text(function (g) { return " " + g.name; });

    div.select("#group_filter_all").on("click", function () {
        d3.event.preventDefault();
        items.select("input").property("checked", true);
        update();
    });
};
