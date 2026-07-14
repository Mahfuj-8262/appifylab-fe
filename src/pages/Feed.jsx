import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";

// PostVisibility enum from the API is serialized as an int (0 = Public, 1 = Private).
const VIS = { 0: "Public", 1: "Private" };

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, s] of units) {
    const v = Math.floor(secs / s);
    if (v >= 1) return `${v} ${name}${v > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

// "Who liked" — builds a readable summary from the (max-5) preview + total count.
function likedByText(likers, likeCount) {
  if (!likeCount) return "";
  const names = (likers || []).map((l) => `${l.firstName} ${l.lastName}`);
  if (names.length === 0) return `${likeCount} like${likeCount > 1 ? "s" : ""}`;
  if (likeCount <= names.length) return `Liked by ${names.join(", ")}`;
  return `Liked by ${names.join(", ")} and ${likeCount - names.length} more`;
}

// Feed page — dynamic, backed by the API. The layout chrome (dark-mode switch,
// nav, create-post box) is the converted template markup; posts/comments are
// rendered from data. Everything stays in this single file (no sub-components).
export default function Feed() {
  const navigate = useNavigate();
  const user = api.getCachedUser() || {};
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "You";
  const fileRef = useRef(null);

  const linkBtn = {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  };

  // layout chrome state (was assets/js/custom.js)
  const [darkMode, setDarkMode] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // feed
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");

  // create-post
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("Public");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [posting, setPosting] = useState(false);

  // per-post interaction
  const [openMenu, setOpenMenu] = useState(null); // postId whose "..." menu is open
  const [openComments, setOpenComments] = useState(null); // postId whose thread is open
  const [commentsByPost, setCommentsByPost] = useState({}); // postId -> CommentResponse[]
  const [commentDrafts, setCommentDrafts] = useState({}); // postId -> text
  const [replyOpen, setReplyOpen] = useState(null); // commentId being replied to
  const [replyDrafts, setReplyDrafts] = useState({}); // commentId -> text

  const toggleDark = () => setDarkMode((v) => !v);
  const toggleProfile = () => setProfileOpen((v) => !v);

  const handleLogout = async (e) => {
    e.preventDefault();
    try {
      await api.logout();
    } catch (_) {
      /* ignore — clear client state regardless */
    }
    navigate("/login");
  };

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setFeedError("");
    try {
      const data = await api.getFeed();
      setPosts(data.posts || []);
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      setFeedError(e.message || "Failed to load the feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.getFeed(nextCursor);
      setPosts((prev) => [...prev, ...(data.posts || [])]);
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      setFeedError(e.message || "Failed to load more posts.");
    } finally {
      setLoadingMore(false);
    }
  };

  const onSelectImage = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };
  const clearImage = () => {
    setImageFile(null);
    setImagePreview("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitPost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      const created = await api.createPost({ content: content.trim(), visibility, imageFile });
      setPosts((prev) => [created, ...prev]); // newest first
      setContent("");
      setVisibility("Public");
      clearImage();
    } catch (e) {
      alert(e.message || "Could not create the post.");
    } finally {
      setPosting(false);
    }
  };

  const likePost = async (postId) => {
    try {
      const { liked } = await api.togglePostLike(postId);
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const me = { userId: user.userId, firstName: user.firstName, lastName: user.lastName };
          const likers = liked
            ? [me, ...p.likersPreview.filter((l) => l.userId !== user.userId)].slice(0, 5)
            : p.likersPreview.filter((l) => l.userId !== user.userId);
          return {
            ...p,
            isLikedByCurrentUser: liked,
            likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)),
            likersPreview: likers,
          };
        })
      );
    } catch (e) {
      alert(e.message || "Could not update like.");
    }
  };

  const removePost = async (postId) => {
    setOpenMenu(null);
    if (!window.confirm("Delete this post?")) return;
    try {
      await api.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      alert(e.message || "Could not delete the post.");
    }
  };

  const reloadComments = async (postId) => {
    try {
      const data = await api.getComments(postId);
      setCommentsByPost((m) => ({ ...m, [postId]: data }));
    } catch (_) {
      /* keep whatever is currently shown */
    }
  };

  const openThread = async (postId) => {
    const next = openComments === postId ? null : postId;
    setOpenComments(next);
    if (next && !commentsByPost[postId]) await reloadComments(postId);
  };

  const submitComment = async (postId) => {
    const text = (commentDrafts[postId] || "").trim();
    if (!text) return;
    try {
      await api.addComment(postId, text, null);
      setCommentDrafts((d) => ({ ...d, [postId]: "" }));
      await reloadComments(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)));
    } catch (e) {
      alert(e.message || "Could not add comment.");
    }
  };

  const submitReply = async (postId, parentId) => {
    const text = (replyDrafts[parentId] || "").trim();
    if (!text) return;
    try {
      await api.addComment(postId, text, parentId);
      setReplyDrafts((d) => ({ ...d, [parentId]: "" }));
      setReplyOpen(null);
      await reloadComments(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)));
    } catch (e) {
      alert(e.message || "Could not add reply.");
    }
  };

  const likeComment = async (postId, commentId) => {
    try {
      await api.toggleCommentLike(commentId);
      await reloadComments(postId);
    } catch (e) {
      alert(e.message || "Could not update like.");
    }
  };

  const removeComment = async (postId, commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api.deleteComment(commentId);
      await reloadComments(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p))
      );
    } catch (e) {
      alert(e.message || "Could not delete the comment.");
    }
  };

  // A comment (and, recursively, its replies).
  function renderComment(postId, c, depth) {
    const mine = c.author.userId === user.userId;
    const likedText = likedByText(c.likersPreview, c.likeCount);
    return (
      <div className="_comment_main" key={c.id} style={depth ? { marginLeft: 38 } : undefined}>
        <div className="_comment_image">
          <span className="_comment_image_link">
            <img src="/assets/images/txt_img.png" alt="" className="_comment_img1" />
          </span>
        </div>
        <div className="_comment_area">
          <div className="_comment_details">
            <div className="_comment_details_top">
              <div className="_comment_name">
                <h4 className="_comment_name_title">
                  {c.author.firstName} {c.author.lastName}
                </h4>
              </div>
            </div>
            <div className="_comment_status">
              <p className="_comment_status_text">
                <span>{c.content}</span>
              </p>
            </div>
            <div className="_total_reactions">
              <div className="_total_react">
                <span className="_reaction_like">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                  </svg>
                </span>
              </div>
              <span className="_total" title={likedText}>
                {c.likeCount}
              </span>
            </div>
            <div className="_comment_reply">
              <div className="_comment_reply_num">
                <ul className="_comment_reply_list">
                  <li>
                    <button type="button" style={linkBtn} onClick={() => likeComment(postId, c.id)}>
                      <span>{c.isLikedByCurrentUser ? "Unlike" : "Like"}.</span>
                    </button>
                  </li>
                  <li>
                    <button type="button" style={linkBtn} onClick={() => setReplyOpen(replyOpen === c.id ? null : c.id)}>
                      <span>Reply.</span>
                    </button>
                  </li>
                  {mine && (
                    <li>
                      <button type="button" style={linkBtn} onClick={() => removeComment(postId, c.id)}>
                        <span>Delete.</span>
                      </button>
                    </li>
                  )}
                  <li>
                    <span className="_time_link">{timeAgo(c.createdAt)}</span>
                  </li>
                </ul>
              </div>
            </div>
            {likedText && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{likedText}</div>}
            {replyOpen === c.id && (
              <div className="_feed_inner_comment_box">
                <form
                  className="_feed_inner_comment_box_form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitReply(postId, c.id);
                  }}
                >
                  <div className="_feed_inner_comment_box_content">
                    <div className="_feed_inner_comment_box_content_txt">
                      <textarea
                        className="form-control _comment_textarea"
                        placeholder="Write a reply"
                        value={replyDrafts[c.id] || ""}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      ></textarea>
                    </div>
                  </div>
                  <div className="_feed_inner_comment_box_icon">
                    <button type="submit" className="_feed_inner_comment_box_icon_btn" style={{ width: "auto", padding: "0 10px" }}>
                      Reply
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
          {c.replies && c.replies.length > 0 && (
            <div className="_comment_replies">{c.replies.map((r) => renderComment(postId, r, depth + 1))}</div>
          )}
        </div>
      </div>
    );
  }

  // A single post card.
  function renderPost(post) {
    const comments = commentsByPost[post.id] || [];
    const mine = post.author.userId === user.userId;
    const likedText = likedByText(post.likersPreview, post.likeCount);
    return (
      <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16" key={post.id}>
        <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
          <div className="_feed_inner_timeline_post_top">
            <div className="_feed_inner_timeline_post_box">
              <div className="_feed_inner_timeline_post_box_image">
                <img src="/assets/images/post_img.png" alt="" className="_post_img" />
              </div>
              <div className="_feed_inner_timeline_post_box_txt">
                <h4 className="_feed_inner_timeline_post_box_title">
                  {post.author.firstName} {post.author.lastName}
                </h4>
                <p className="_feed_inner_timeline_post_box_para">
                  {timeAgo(post.createdAt)} ·{" "}
                  <a href="#0" onClick={(e) => e.preventDefault()}>
                    {VIS[post.visibility] || "Public"}
                  </a>
                </p>
              </div>
            </div>
            <div className="_feed_inner_timeline_post_box_dropdown">
              <div className="_feed_timeline_post_dropdown">
                <button
                  type="button"
                  className="_feed_timeline_post_dropdown_link"
                  onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="4" height="17" fill="none" viewBox="0 0 4 17">
                    <circle cx="2" cy="2" r="2" fill="#C4C4C4" />
                    <circle cx="2" cy="8" r="2" fill="#C4C4C4" />
                    <circle cx="2" cy="15" r="2" fill="#C4C4C4" />
                  </svg>
                </button>
              </div>
              <div className={"_feed_timeline_dropdown _timeline_dropdown" + (openMenu === post.id ? " show" : "")}>
                <ul className="_feed_timeline_dropdown_list">
                  {mine ? (
                    <li className="_feed_timeline_dropdown_item">
                      <a
                        href="#0"
                        className="_feed_timeline_dropdown_link"
                        onClick={(e) => {
                          e.preventDefault();
                          removePost(post.id);
                        }}
                      >
                        <span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 18 18">
                            <path stroke="#1890FF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M2.25 4.5h13.5M6 4.5V3a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0112 3v1.5m2.25 0V15a1.5 1.5 0 01-1.5 1.5h-7.5a1.5 1.5 0 01-1.5-1.5V4.5h10.5zM7.5 8.25v4.5M10.5 8.25v4.5" />
                          </svg>
                        </span>
                        Delete Post
                      </a>
                    </li>
                  ) : (
                    <li className="_feed_timeline_dropdown_item">
                      <a href="#0" className="_feed_timeline_dropdown_link" onClick={(e) => e.preventDefault()}>
                        <span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 18 18">
                            <path stroke="#1890FF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M14.25 15.75L9 12l-5.25 3.75v-12a1.5 1.5 0 011.5-1.5h7.5a1.5 1.5 0 011.5 1.5v12z" />
                          </svg>
                        </span>
                        Save Post
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
          <h4 className="_feed_inner_timeline_post_title">{post.content}</h4>
          {post.imageUrl && (
            <div className="_feed_inner_timeline_image">
              <img src={api.mediaUrl(post.imageUrl)} alt="" className="_time_img" />
            </div>
          )}
        </div>

        <div className="_feed_inner_timeline_total_reacts _padd_r24 _padd_l24 _mar_b26">
          <div className="_feed_inner_timeline_total_reacts_image">
            {post.likeCount > 0 && <img src="/assets/images/react_img1.png" alt="" className="_react_img1" />}
            <p className="_feed_inner_timeline_total_reacts_para" title={likedText}>
              {post.likeCount}
            </p>
          </div>
          <div className="_feed_inner_timeline_total_reacts_txt">
            <p className="_feed_inner_timeline_total_reacts_para1">
              <span>{post.commentCount}</span> Comment
            </p>
          </div>
        </div>
        {likedText && (
          <div className="_padd_r24 _padd_l24 _mar_b16" style={{ fontSize: 13, opacity: 0.75 }}>
            {likedText}
          </div>
        )}

        <div className="_feed_inner_timeline_reaction">
          <button
            className={"_feed_inner_timeline_reaction_emoji _feed_reaction" + (post.isLikedByCurrentUser ? " _feed_reaction_active" : "")}
            onClick={() => likePost(post.id)}
          >
            <span className="_feed_inner_timeline_reaction_link">
              <span>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
                {post.isLikedByCurrentUser ? "Liked" : "Like"}
              </span>
            </span>
          </button>
          <button className="_feed_inner_timeline_reaction_comment _feed_reaction" onClick={() => openThread(post.id)}>
            <span className="_feed_inner_timeline_reaction_link">
              <span>
                <svg className="_reaction_svg" xmlns="http://www.w3.org/2000/svg" width="21" height="21" fill="none" viewBox="0 0 21 21">
                  <path stroke="#000" d="M1 10.5c0-.464 0-.696.009-.893A9 9 0 019.607 1.01C9.804 1 10.036 1 10.5 1v0c.464 0 .696 0 .893.009a9 9 0 018.598 8.598c.009.197.009.429.009.893v6.046c0 1.36 0 2.041-.317 2.535a2 2 0 01-.602.602c-.494.317-1.174.317-2.535.317H10.5c-.464 0-.696 0-.893-.009a9 9 0 01-8.598-8.598C1 11.196 1 10.964 1 10.5v0z" />
                  <path stroke="#000" strokeLinecap="round" strokeLinejoin="round" d="M6.938 9.313h7.125M10.5 14.063h3.563" />
                </svg>
                Comment
              </span>
            </span>
          </button>
        </div>

        {openComments === post.id && (
          <div className="_feed_inner_timeline_cooment_area">
            <div className="_feed_inner_comment_box">
              <form
                className="_feed_inner_comment_box_form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitComment(post.id);
                }}
              >
                <div className="_feed_inner_comment_box_content">
                  <div className="_feed_inner_comment_box_content_image">
                    <img src="/assets/images/comment_img.png" alt="" className="_comment_img" />
                  </div>
                  <div className="_feed_inner_comment_box_content_txt">
                    <textarea
                      className="form-control _comment_textarea"
                      placeholder="Write a comment"
                      value={commentDrafts[post.id] || ""}
                      onChange={(e) => setCommentDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                    ></textarea>
                  </div>
                </div>
                <div className="_feed_inner_comment_box_icon">
                  <button type="submit" className="_feed_inner_comment_box_icon_btn" style={{ width: "auto", padding: "0 10px" }}>
                    Send
                  </button>
                </div>
              </form>
            </div>
            <div className="_timline_comment_main">
              {comments.length === 0 && <p style={{ opacity: 0.6, paddingLeft: 8 }}>No comments yet.</p>}
              {comments.map((c) => renderComment(post.id, c, 0))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={"_layout _layout_main_wrapper" + (darkMode ? " _dark_wrapper" : "")}>
      <div className="_layout_mode_swithing_btn">
			<button type="button" className="_layout_swithing_btn_link" onClick={toggleDark}>
				<div className="_layout_swithing_btn">
					<div className="_layout_swithing_btn_round">
											  
					</div>
				</div>
				<div className="_layout_change_btn_ic1">
					<svg xmlns="http://www.w3.org/2000/svg" width="11" height="16" fill="none" viewBox="0 0 11 16">
						<path fill="#fff" d="M2.727 14.977l.04-.498-.04.498zm-1.72-.49l.489-.11-.489.11zM3.232 1.212L3.514.8l-.282.413zM9.792 8a6.5 6.5 0 00-6.5-6.5v-1a7.5 7.5 0 017.5 7.5h-1zm-6.5 6.5a6.5 6.5 0 006.5-6.5h1a7.5 7.5 0 01-7.5 7.5v-1zm-.525-.02c.173.013.348.02.525.02v1c-.204 0-.405-.008-.605-.024l.08-.997zm-.261-1.83A6.498 6.498 0 005.792 7h1a7.498 7.498 0 01-3.791 6.52l-.495-.87zM5.792 7a6.493 6.493 0 00-2.841-5.374L3.514.8A7.493 7.493 0 016.792 7h-1zm-3.105 8.476c-.528-.042-.985-.077-1.314-.155-.316-.075-.746-.242-.854-.726l.977-.217c-.028-.124-.145-.09.106-.03.237.056.6.086 1.165.131l-.08.997zm.314-1.956c-.622.354-1.045.596-1.31.792a.967.967 0 00-.204.185c-.01.013.027-.038.009-.12l-.977.218a.836.836 0 01.144-.666c.112-.162.27-.3.433-.42.324-.24.814-.519 1.41-.858L3 13.52zM3.292 1.5a.391.391 0 00.374-.285A.382.382 0 003.514.8l-.563.826A.618.618 0 012.702.95a.609.609 0 01.59-.45v1z"/>
					</svg>
				</div>
				<div className="_layout_change_btn_ic2">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
						<circle cx="12" cy="12" r="4.389" stroke="#fff" transform="rotate(-90 12 12)"/>
						<path stroke="#fff" strokeLinecap="round" d="M3.444 12H1M23 12h-2.444M5.95 5.95L4.222 4.22M19.778 19.779L18.05 18.05M12 3.444V1M12 23v-2.445M18.05 5.95l1.728-1.729M4.222 19.779L5.95 18.05"/>
					</svg>					  
				</div>
			</button>
		</div>
      <div className="_main_layout">
        <nav className="navbar navbar-expand-lg navbar-light _header_nav _padd_t10">
				<div className="container _custom_container">
					<div className="_logo_wrap">
						<a className="navbar-brand" href="#0">
							<img src="/assets/images/logo.svg" alt="" className="_nav_logo" />
						</a>
					</div>
					<button className="navbar-toggler bg-light" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation"> <span className="navbar-toggler-icon"></span>
					</button>
					<div className="collapse navbar-collapse" id="navbarSupportedContent">
						<div className="_header_form ms-auto">
							<form className="_header_form_grp" onSubmit={(e) => e.preventDefault()}>
								<svg className="_header_form_svg" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 17 17">
									<circle cx="7" cy="7" r="6" stroke="#666" />
									<path stroke="#666" strokeLinecap="round" d="M16 16l-3-3" />
								</svg>
								<input className="form-control me-2 _inpt1" type="search" placeholder="input search text" aria-label="Search" />
							</form>
						</div>
						<ul className="navbar-nav mb-2 mb-lg-0 _header_nav_list ms-auto _mar_r8">
							<li className="nav-item _header_nav_item">
								<a className="nav-link _header_nav_link_active _header_nav_link" aria-current="page" href="#0">
									<svg xmlns="http://www.w3.org/2000/svg" width="18" height="21" fill="none" viewBox="0 0 18 21">
										<path className="_home_active" stroke="#000" strokeWidth="1.5" strokeOpacity=".6" d="M1 9.924c0-1.552 0-2.328.314-3.01.313-.682.902-1.187 2.08-2.196l1.143-.98C6.667 1.913 7.732 1 9 1c1.268 0 2.333.913 4.463 2.738l1.142.98c1.179 1.01 1.768 1.514 2.081 2.196.314.682.314 1.458.314 3.01v4.846c0 2.155 0 3.233-.67 3.902-.669.67-1.746.67-3.901.67H5.57c-2.155 0-3.232 0-3.902-.67C1 18.002 1 16.925 1 14.77V9.924z" />
										<path className="_home_active" stroke="#000" strokeOpacity=".6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11.857 19.341v-5.857a1 1 0 00-1-1H7.143a1 1 0 00-1 1v5.857" />
									</svg>
								</a>
							</li>
							<li className="nav-item _header_nav_item">
								<a className="nav-link _header_nav_link" aria-current="page" href="#0">
									<svg xmlns="http://www.w3.org/2000/svg" width="26" height="20" fill="none" viewBox="0 0 26 20">
										<path fill="#000" fillOpacity=".6" fillRule="evenodd" d="M12.79 12.15h.429c2.268.015 7.45.243 7.45 3.732 0 3.466-5.002 3.692-7.415 3.707h-.894c-2.268-.015-7.452-.243-7.452-3.727 0-3.47 5.184-3.697 7.452-3.711l.297-.001h.132zm0 1.75c-2.792 0-6.12.34-6.12 1.962 0 1.585 3.13 1.955 5.864 1.976l.255.002c2.792 0 6.118-.34 6.118-1.958 0-1.638-3.326-1.982-6.118-1.982zm9.343-2.224c2.846.424 3.444 1.751 3.444 2.79 0 .636-.251 1.794-1.931 2.43a.882.882 0 01-1.137-.506.873.873 0 01.51-1.13c.796-.3.796-.633.796-.793 0-.511-.654-.868-1.944-1.06a.878.878 0 01-.741-.996.886.886 0 011.003-.735zm-17.685.735a.878.878 0 01-.742.997c-1.29.19-1.944.548-1.944 1.059 0 .16 0 .491.798.793a.873.873 0 01-.314 1.693.897.897 0 01-.313-.057C.25 16.259 0 15.1 0 14.466c0-1.037.598-2.366 3.446-2.79.485-.06.929.257 1.002.735zM12.789 0c2.96 0 5.368 2.392 5.368 5.33 0 2.94-2.407 5.331-5.368 5.331h-.031a5.329 5.329 0 01-3.782-1.57 5.253 5.253 0 01-1.553-3.764C7.423 2.392 9.83 0 12.789 0zm0 1.75c-1.987 0-3.604 1.607-3.604 3.58a3.526 3.526 0 001.04 2.527 3.58 3.58 0 002.535 1.054l.03.875v-.875c1.987 0 3.605-1.605 3.605-3.58S14.777 1.75 12.789 1.75zm7.27-.607a4.222 4.222 0 013.566 4.172c-.004 2.094-1.58 3.89-3.665 4.181a.88.88 0 01-.994-.745.875.875 0 01.75-.989 2.494 2.494 0 002.147-2.45 2.473 2.473 0 00-2.09-2.443.876.876 0 01-.726-1.005.881.881 0 011.013-.721zm-13.528.72a.876.876 0 01-.726 1.006 2.474 2.474 0 00-2.09 2.446A2.493 2.493 0 005.86 7.762a.875.875 0 11-.243 1.734c-2.085-.29-3.66-2.087-3.664-4.179 0-2.082 1.5-3.837 3.566-4.174a.876.876 0 011.012.72z" clipRule="evenodd" />
									</svg>
								</a>
							</li>
							<li className="nav-item _header_nav_item">
								<span id="_notify_btn" className="nav-link _header_nav_link _header_notify_btn">
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="22" fill="none" viewBox="0 0 20 22">
										<path fill="#000" fillOpacity=".6" fillRule="evenodd" d="M7.547 19.55c.533.59 1.218.915 1.93.915.714 0 1.403-.324 1.938-.916a.777.777 0 011.09-.056c.318.284.344.77.058 1.084-.832.917-1.927 1.423-3.086 1.423h-.002c-1.155-.001-2.248-.506-3.077-1.424a.762.762 0 01.057-1.083.774.774 0 011.092.057zM9.527 0c4.58 0 7.657 3.543 7.657 6.85 0 1.702.436 2.424.899 3.19.457.754.976 1.612.976 3.233-.36 4.14-4.713 4.478-9.531 4.478-4.818 0-9.172-.337-9.528-4.413-.003-1.686.515-2.544.973-3.299l.161-.27c.398-.679.737-1.417.737-2.918C1.871 3.543 4.948 0 9.528 0zm0 1.535c-3.6 0-6.11 2.802-6.11 5.316 0 2.127-.595 3.11-1.12 3.978-.422.697-.755 1.247-.755 2.444.173 1.93 1.455 2.944 7.986 2.944 6.494 0 7.817-1.06 7.988-3.01-.003-1.13-.336-1.681-.757-2.378-.526-.868-1.12-1.851-1.12-3.978 0-2.514-2.51-5.316-6.111-5.316z" clipRule="evenodd" />
									</svg>
									<span className="_counting">6</span> 
								</span>
							</li>
							<li className="nav-item _header_nav_item">
								<a className="nav-link _header_nav_link" aria-current="page" href="#0">
									<svg xmlns="http://www.w3.org/2000/svg" width="23" height="22" fill="none" viewBox="0 0 23 22">
										<path fill="#000" fillOpacity=".6" fillRule="evenodd" d="M11.43 0c2.96 0 5.743 1.143 7.833 3.22 4.32 4.29 4.32 11.271 0 15.562C17.145 20.886 14.293 22 11.405 22c-1.575 0-3.16-.33-4.643-1.012-.437-.174-.847-.338-1.14-.338-.338.002-.793.158-1.232.308-.9.307-2.022.69-2.852-.131-.826-.822-.445-1.932-.138-2.826.152-.44.307-.895.307-1.239 0-.282-.137-.642-.347-1.161C-.57 11.46.322 6.47 3.596 3.22A11.04 11.04 0 0111.43 0zm0 1.535A9.5 9.5 0 004.69 4.307a9.463 9.463 0 00-1.91 10.686c.241.592.474 1.17.474 1.77 0 .598-.207 1.201-.39 1.733-.15.439-.378 1.1-.231 1.245.143.147.813-.085 1.255-.235.53-.18 1.133-.387 1.73-.391.597 0 1.161.225 1.758.463 3.655 1.679 7.98.915 10.796-1.881 3.716-3.693 3.716-9.7 0-13.391a9.5 9.5 0 00-6.74-2.77zm4.068 8.867c.57 0 1.03.458 1.03 1.024 0 .566-.46 1.023-1.03 1.023a1.023 1.023 0 11-.01-2.047h.01zm-4.131 0c.568 0 1.03.458 1.03 1.024 0 .566-.462 1.023-1.03 1.023a1.03 1.03 0 01-1.035-1.024c0-.566.455-1.023 1.025-1.023h.01zm-4.132 0c.568 0 1.03.458 1.03 1.024 0 .566-.462 1.023-1.03 1.023a1.022 1.022 0 11-.01-2.047h.01z" clipRule="evenodd" />
									</svg> <span className="_counting">2</span> 
								</a>
							</li>
						</ul>
						<div className="_header_nav_profile">
							<div className="_header_nav_profile_image">
								<img src="/assets/images/profile.png" alt="" className="_nav_profile_img" />
							</div>
							<div className="_header_nav_dropdown">
								<p className="_header_nav_para">{fullName}</p>
								<button id="_profile_drop_show_btn" className="_header_nav_dropdown_btn _dropdown_toggle" type="button" onClick={toggleProfile}>
									<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" fill="none" viewBox="0 0 10 6">
										<path fill="#112032" d="M5 5l.354.354L5 5.707l-.354-.353L5 5zm4.354-3.646l-4 4-.708-.708 4-4 .708.708zm-4.708 4l-4-4 .708-.708 4 4-.708.708z" />
									</svg>
								</button>
							</div>
							
							<div id="_prfoile_drop" className={"_nav_profile_dropdown _profile_dropdown" + (profileOpen ? " show" : "")}>
								<ul className="_nav_dropdown_list">
									<li className="_nav_dropdown_list_item">
										<a href="#0" className="_nav_dropdown_link" onClick={handleLogout}>
											<div className="_nav_drop_info">
												<span>
													<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="none" viewBox="0 0 19 19">
														<path stroke="#377DFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6.667 18H2.889A1.889 1.889 0 011 16.111V2.89A1.889 1.889 0 012.889 1h3.778M13.277 14.222L18 9.5l-4.723-4.722M18 9.5H6.667"/>
													</svg>
												</span>
												Log Out
											</div>
										</a>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</nav>
        {/* Main Layout Structure */}
        <div className="container _custom_container">
          <div className="_layout_inner_wrap">
            <div className="row">
              <div className="col-xl-8 col-lg-10 col-md-12 col-sm-12 mx-auto">
                <div className="_layout_middle_wrap">
                  <div className="_layout_middle_inner">
                    <div className="_feed_inner_text_area  _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16">
										<div className="_feed_inner_text_area_box">
											<div className="_feed_inner_text_area_box_image">
												<img src="/assets/images/txt_img.png" alt="" className="_txt_img" />
											</div>
											<div className="form-floating _feed_inner_text_area_box_form ">
												<textarea className="form-control _textarea" placeholder="Write something ..." id="floatingTextarea" value={content} onChange={(e) => setContent(e.target.value)}></textarea>
												<label className="_feed_textarea_label" htmlFor="floatingTextarea">Write something ...
													<svg xmlns="http://www.w3.org/2000/svg" width="23" height="24" fill="none" viewBox="0 0 23 24">
														<path fill="#666" d="M19.504 19.209c.332 0 .601.289.601.646 0 .326-.226.596-.52.64l-.081.005h-6.276c-.332 0-.602-.289-.602-.645 0-.327.227-.597.52-.64l.082-.006h6.276zM13.4 4.417c1.139-1.223 2.986-1.223 4.125 0l1.182 1.268c1.14 1.223 1.14 3.205 0 4.427L9.82 19.649a2.619 2.619 0 01-1.916.85h-3.64c-.337 0-.61-.298-.6-.66l.09-3.941a3.019 3.019 0 01.794-1.982l8.852-9.5zm-.688 2.562l-7.313 7.85a1.68 1.68 0 00-.441 1.101l-.077 3.278h3.023c.356 0 .698-.133.968-.376l.098-.096 7.35-7.887-3.608-3.87zm3.962-1.65a1.633 1.633 0 00-2.423 0l-.688.737 3.606 3.87.688-.737c.631-.678.666-1.755.105-2.477l-.105-.124-1.183-1.268z" />
													</svg>
												</label>
											</div>
										</div>
										
										<input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={onSelectImage} />
{imagePreview && (
  <div style={{ margin: "12px 0" }}>
    <img src={imagePreview} alt="" style={{ maxWidth: "100%", borderRadius: 6 }} />
    <button type="button" onClick={clearImage} style={{ background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer", color: "#e53e3e", display: "block" }}>Remove image</button>
  </div>
)}
<div className="_feed_inner_text_area_bottom">
											<div className="_feed_inner_text_area_item">
												<div className="_feed_inner_text_area_bottom_photo _feed_common">
													<button type="button" className="_feed_inner_text_area_bottom_photo_link" onClick={() => fileRef.current && fileRef.current.click()}> <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img"> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 20 20">
														<path fill="#666" d="M13.916 0c3.109 0 5.18 2.429 5.18 5.914v8.17c0 3.486-2.072 5.916-5.18 5.916H5.999C2.89 20 .827 17.572.827 14.085v-8.17C.827 2.43 2.897 0 6 0h7.917zm0 1.504H5.999c-2.321 0-3.799 1.735-3.799 4.41v8.17c0 2.68 1.472 4.412 3.799 4.412h7.917c2.328 0 3.807-1.734 3.807-4.411v-8.17c0-2.678-1.478-4.411-3.807-4.411zm.65 8.68l.12.125 1.9 2.147a.803.803 0 01-.016 1.063.642.642 0 01-.894.058l-.076-.074-1.9-2.148a.806.806 0 00-1.205-.028l-.074.087-2.04 2.717c-.722.963-2.02 1.066-2.86.26l-.111-.116-.814-.91a.562.562 0 00-.793-.07l-.075.073-1.4 1.617a.645.645 0 01-.97.029.805.805 0 01-.09-.977l.064-.086 1.4-1.617c.736-.852 1.95-.897 2.734-.137l.114.12.81.905a.587.587 0 00.861.033l.07-.078 2.04-2.718c.81-1.08 2.27-1.19 3.205-.275zM6.831 4.64c1.265 0 2.292 1.125 2.292 2.51 0 1.386-1.027 2.511-2.292 2.511S4.54 8.537 4.54 7.152c0-1.386 1.026-2.51 2.291-2.51zm0 1.504c-.507 0-.918.451-.918 1.007 0 .555.411 1.006.918 1.006.507 0 .919-.451.919-1.006 0-.556-.412-1.007-.919-1.007z"/>
													  </svg></span>
														Photo</button>
												</div>
											</div>
											<div className="_feed_common" style={{ display: "flex", alignItems: "center", marginRight: 12 }}>
  <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="form-select" style={{ width: "auto" }} aria-label="Post visibility">
    <option value="Public">Public</option>
    <option value="Private">Private</option>
  </select>
</div>
<div className="_feed_inner_text_area_btn">
												<button type="button" className="_feed_inner_text_area_btn_link" onClick={submitPost} disabled={posting}>
													<svg className="_mar_img" xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" viewBox="0 0 14 13">
														<path fill="#fff" fillRule="evenodd" d="M6.37 7.879l2.438 3.955a.335.335 0 00.34.162c.068-.01.23-.05.289-.247l3.049-10.297a.348.348 0 00-.09-.35.341.341 0 00-.34-.088L1.75 4.03a.34.34 0 00-.247.289.343.343 0 00.16.347L5.666 7.17 9.2 3.597a.5.5 0 01.712.703L6.37 7.88zM9.097 13c-.464 0-.89-.236-1.14-.641L5.372 8.165l-4.237-2.65a1.336 1.336 0 01-.622-1.331c.074-.536.441-.96.957-1.112L11.774.054a1.347 1.347 0 011.67 1.682l-3.05 10.296A1.332 1.332 0 019.098 13z" clipRule="evenodd" />
													</svg> <span>{posting ? "Posting…" : "Post"}</span> 
												</button>
											</div>
										</div>
										
									</div>
                    {loading && <p className="_padd_l24">Loading feed…</p>}
                    {feedError && <p className="_padd_l24" style={{ color: "#e53e3e" }}>{feedError}</p>}
                    {!loading && !feedError && posts.length === 0 && (
                      <p className="_padd_l24">No posts yet — create the first one!</p>
                    )}
                    {posts.map((p) => renderPost(p))}
                    {nextCursor && (
                      <div className="_padd_l24 _mar_b16">
                        <button type="button" className="_feed_inner_text_area_btn_link" onClick={loadMore} disabled={loadingMore}>
                          <span>{loadingMore ? "Loading…" : "Load more"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
